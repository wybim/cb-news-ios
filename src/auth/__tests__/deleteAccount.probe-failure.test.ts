/// <reference types="jest" />
/**
 * Task 275 (BLI 258, đợt 3e — bản THĂM DÒ) — DoD bắt buộc "phép thử TRƯỢT ĐƯỢC":
 * chứng minh bước thăm dò (`runDeleteAccountProbe()` trong `deleteAccount.ts`) KHÔNG
 * được chặn việc xoá dữ liệu tại chỗ, dù nhánh thăm dò hỏng kiểu gì.
 *
 * `probeSecondAppleSignIn()` tự nó đã có try/catch nội bộ (không throw ra ngoài trong
 * điều kiện bình thường — xem `appleAuth.probe.test.ts`). Test này mô phỏng một lỗi
 * BẤT THƯỜNG hơn: mock thẳng module `../appleAuth` để `probeSecondAppleSignIn` REJECT
 * — tức bỏ qua cả lớp bảo vệ nội bộ của nó, giả định nó có khiếm khuyết không lường
 * trước (đúng tinh thần "phép thử trượt được" — nếu lớp try/catch NGOÀI trong
 * `runDeleteAccountProbe()` bị xoá đi, test này sẽ FAIL thật, không phải luôn xanh).
 *
 * Mẫu theo `deleteAccount.worker-failure.test.ts` (Task 274) — chỉ mock module
 * NATIVE/Expo và chính `appleAuth`, còn `deleteAccount.ts`, `localUserData.ts`,
 * `accountStore.ts` chạy y hệt mã thật.
 */

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

jest.mock('react-native', () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

// `jest.requireActual('../appleAuth')` dưới đây vẫn thực thi toàn bộ appleAuth.ts thật
// (kể cả dòng import 'expo-apple-authentication' ở đầu file) — module đó là ESM thật,
// Jest không parse được nếu không mock, dù ta chỉ cần ghi đè đúng một hàm.
jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// Mock thẳng ../appleAuth: giữ getAppleAuthorizationCode thật (để revokeAppleToken()
// không bị ảnh hưởng), nhưng ép probeSecondAppleSignIn REJECT — mô phỏng lỗi bất
// thường lọt qua cả lớp try/catch nội bộ của chính nó.
jest.mock('../appleAuth', () => {
  const actual = jest.requireActual('../appleAuth');
  return {
    ...actual,
    probeSecondAppleSignIn: jest.fn(async () => {
      throw new Error('loi gia lap: buoc tham do hong bat thuong');
    }),
  };
});

import * as SecureStore from 'expo-secure-store';
import { accountStore } from '../../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../../data/localUserData';
import { deleteAccount } from '../deleteAccount';
import { probeSecondAppleSignIn } from '../appleAuth';

describe('deleteAccount — Task 275: bước thăm dò ném lỗi KHÔNG được chặn việc xoá', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('vẫn xoá sạch dữ liệu cục bộ và đăng xuất dù nhánh thăm dò ném lỗi bất thường', async () => {
    await accountStore.signIn({
      provider: 'apple',
      displayName: 'Nguoi Dung Thu Nghiem',
      providerUserId: 'apple-user-id-thu-nghiem',
    });

    // Xác nhận trước: probe THẬT SỰ ném lỗi trong lượt gọi này (test không tự xanh).
    await expect(probeSecondAppleSignIn()).rejects.toThrow('buoc tham do hong bat thuong');

    // Xoá tài khoản trong khi bước thăm dò hỏng — hàm KHÔNG được throw.
    await expect(deleteAccount()).resolves.toBeUndefined();

    expect(probeSecondAppleSignIn).toHaveBeenCalled();

    // Bằng chứng chính: MỌI khoá đã đăng ký ở LOCAL_USER_DATA_KEYS đã bị xoá thật, và
    // tài khoản đã đăng xuất — dù bước thăm dò ở trên đã ném lỗi.
    for (const entry of LOCAL_USER_DATA_KEYS) {
      if (entry.backend === 'secure-store') {
        await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
      }
    }
    expect(accountStore.getState()).toEqual({ status: 'signed-out' });
  });
});
