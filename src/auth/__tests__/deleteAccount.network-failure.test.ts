/// <reference types="jest" />
/**
 * Task 278 (BLI 258, đợt 3g) — DoD mục 3, ràng buộc bất di dịch `AD-5`
 * (`ad2-phan-dinh-man-xoa-va-ten-mien.md` + `ad-luong-token-apple.md`): "xoá dữ liệu
 * tại chỗ là VÔ ĐIỀU KIỆN" — mạng hỏng, Worker sập, Apple từ chối, người dùng bỏ qua,
 * hay chính luồng đo cổng `AD-12` hỏng theo kiểu KHÔNG lường trước, bước xoá vẫn phải
 * chạy. Thay `deleteAccount.worker-failure.test.ts` + `deleteAccount.probe-failure.test.ts`
 * (Task 274/275, đã gỡ cùng `revokeAppleToken()`/`runDeleteAccountProbe()`).
 *
 * Bẫy kinh điển brief cảnh báo: đặt lời gọi mạng trong `try` rồi để `catch` thoát sớm
 * khỏi cả hàm xoá. Test này ép lỗi ở HAI lớp khác nhau để chứng minh bẫy đó không xảy
 * ra: (A) `getFreshAppleRevocationCode()` chính nó REJECT bất thường (mô phỏng một lỗi
 * lọt qua cả lớp try/catch nội bộ của `appleAuth.ts`); (B) `fetch` ném lỗi mạng thật.
 *
 * Chỉ mock module NATIVE/Expo và chính `../appleAuth` ở test (A) — `deleteAccount.ts`,
 * `localUserData.ts`, `accountStore.ts` chạy y hệt mã thật (đo đúng đối tượng, xem
 * kb/lessons/2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md).
 */

// Factory KHÔNG tham chiếu biến ngoài phạm vi — tránh lỗi temporal-dead-zone của
// babel-plugin-jest-hoist. Hành vi thật (luôn bấm "Tiếp tục" — test này đo lỗi XẢY RA
// SAU màn giải thích, không đo màn giải thích) gắn sau, trong beforeEach.
jest.mock('react-native', () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  GoogleSignin: {
    configure: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    revokeAccess: jest.fn(),
  },
  isSuccessResponse: jest.fn(() => false),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// Mock thẳng ../appleAuth: ép getFreshAppleRevocationCode REJECT — mô phỏng lỗi bất
// thường lọt qua cả lớp try/catch nội bộ của chính nó (đúng tinh thần "phép thử trượt
// được": nếu lớp try/catch NGOÀI trong runAppleRevocationFlow() bị xoá đi, test (A)
// dưới đây sẽ FAIL thật, không phải luôn xanh).
jest.mock('../appleAuth', () => {
  const actual = jest.requireActual('../appleAuth');
  return {
    ...actual,
    getFreshAppleRevocationCode: jest.fn(async () => {
      throw new Error('loi gia lap: lop tham do hong bat thuong');
    }),
  };
});

import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { accountStore } from '../../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../../data/localUserData';
import { deleteAccount } from '../deleteAccount';
import { getFreshAppleRevocationCode } from '../appleAuth';

describe('deleteAccount — Task 278: xoá dữ liệu tại chỗ vô điều kiện (AD-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Alert.alert as jest.Mock).mockImplementation(
      (_title: string, _message?: string, buttons?: Array<{ text: string; onPress?: () => void }>) => {
        if (buttons && buttons.length > 0) {
          const tiepTuc = buttons.find((b) => b.text === 'Tiếp tục') ?? buttons[buttons.length - 1];
          tiepTuc.onPress?.();
        }
      },
    );
  });

  it('(A) vẫn xoá sạch dữ liệu và đăng xuất dù getFreshAppleRevocationCode() ném lỗi bất thường', async () => {
    await accountStore.signIn({
      provider: 'apple',
      displayName: 'Nguoi Dung Thu Nghiem',
      providerUserId: 'apple-user-id-thu-nghiem',
    });

    await expect(getFreshAppleRevocationCode()).rejects.toThrow(
      'loi gia lap: lop tham do hong bat thuong',
    );

    await expect(deleteAccount()).resolves.toBeUndefined();

    expect(getFreshAppleRevocationCode).toHaveBeenCalled();
    for (const entry of LOCAL_USER_DATA_KEYS) {
      if (entry.backend === 'secure-store') {
        await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
      }
    }
    expect(accountStore.getState()).toEqual({ status: 'signed-out' });
  });

  it('(B) vẫn xoá sạch dữ liệu và đăng xuất dù fetch lên Worker ném lỗi mạng thật (địa chỉ sai)', async () => {
    // Ghi đè lại mock ở mức module: bài test này cần getFreshAppleRevocationCode TRẢ
    // MÃ THẬT (không reject) để luồng đi tới bước gọi fetch — khác test (A) ở trên.
    (getFreshAppleRevocationCode as jest.Mock).mockResolvedValue({
      kind: 'has-code',
      code: 'ma-uy-quyen-thu-nghiem-abc123',
      length: 'ma-uy-quyen-thu-nghiem-abc123'.length,
    });
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: ENOTFOUND worker-sai.invalid'));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await accountStore.signIn({
      provider: 'apple',
      displayName: 'Nguoi Dung Thu Nghiem',
      providerUserId: 'apple-user-id-thu-nghiem',
    });

    await expect(deleteAccount()).resolves.toBeUndefined();

    // Đối chiếu tên trường: app phải gửi đúng {"token": "..."} như Worker thật chờ
    // (src/cb-news-api-worker/src/index.js, hàm xuLyDoiMa) — KHÔNG phải "code" hay
    // "authorizationCode". Gọi 2 lần: thử + đúng một lần thử lại (AD-5).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'ma-uy-quyen-thu-nghiem-abc123' }),
      }),
    );

    for (const entry of LOCAL_USER_DATA_KEYS) {
      if (entry.backend === 'secure-store') {
        await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
      }
    }
    expect(accountStore.getState()).toEqual({ status: 'signed-out' });
  });
});
