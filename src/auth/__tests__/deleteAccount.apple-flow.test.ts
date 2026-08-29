/// <reference types="jest" />
/**
 * Task 278 (BLI 258, đợt 3g) — DoD mục 4: "Tám kết cục ở bảng chữ [...] đều có nhánh
 * sinh ra được, không kết cục nào lọt xuống chữ chung chung." Kiểm luồng thật của
 * `deleteAccount()` nhánh Apple (`runAppleRevocationFlow()` trong `deleteAccount.ts`),
 * đúng thứ tự `AD-10` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`): màn giải thích mới →
 * xin mã mới → gửi Worker chặng 1 (`AD-12`) → hiện kết quả thật.
 *
 * `Alert.alert` được mock để TỰ BẤM nút theo kịch bản mỗi test (biến `mockNextChoice`,
 * đặt tên bắt đầu bằng "mock" theo đúng quy tắc babel-plugin-jest-hoist cho phép tham
 * chiếu biến ngoài phạm vi trong factory của `jest.mock`) — mô phỏng người dùng bấm
 * "Tiếp tục" hoặc "Bỏ qua bước này" ở màn giải thích, và ghi lại MỌI lời gọi Alert để
 * đối chiếu đúng một trong tám dòng chữ ở bảng brief Task 278.
 *
 * Chỉ mock module NATIVE/Expo — `deleteAccount.ts`, `appleAuth.ts`, `localUserData.ts`,
 * `accountStore.ts` chạy y hệt mã thật (đo đúng đối tượng, không đo bản sao — xem
 * kb/lessons/2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md).
 */

type MockAlertButton = { text: string; style?: string; onPress?: () => void };
const mockAlertCalls: Array<[string, string | undefined, MockAlertButton[] | undefined]> = [];
let mockNextChoice: 'Tiếp tục' | 'Bỏ qua bước này' = 'Tiếp tục';

// Factory KHÔNG tham chiếu biến ngoài phạm vi (chỉ gọi jest.fn() trơn) — tránh lỗi
// temporal-dead-zone của babel-plugin-jest-hoist khi jest.mock() bị hoist lên trên cả
// khai báo `const`. Hành vi thật của Alert.alert được gắn sau, trong beforeEach, qua
// `(Alert.alert as jest.Mock).mockImplementation(...)`.
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

import * as AppleAuthentication from 'expo-apple-authentication';
import { Alert } from 'react-native';
import { accountStore } from '../../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../../data/localUserData';
import { deleteAccount } from '../deleteAccount';

const FRESH_CODE = 'ma-uy-quyen-moi-lay-tai-cho-abc123';

function mockWorkerJsonResponse(payload: unknown) {
  return { json: async () => payload } as Response;
}

async function signInAndDeleteAsApple(): Promise<void> {
  await accountStore.signIn({
    provider: 'apple',
    displayName: 'Nguoi Dung Thu Nghiem',
    providerUserId: 'apple-user-id-thu-nghiem',
  });
  await expect(deleteAccount()).resolves.toBeUndefined();
}

/** Bằng chứng chung mọi kịch bản đều phải giữ: xoá sạch + đăng xuất, bất kể AD-12 ra sao. */
async function expectLocalDataFullyCleared(): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  for (const entry of LOCAL_USER_DATA_KEYS) {
    if (entry.backend === 'secure-store') {
      await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
    }
  }
  expect(accountStore.getState()).toEqual({ status: 'signed-out' });
}

function lastAlertMessage(): string | undefined {
  return mockAlertCalls[mockAlertCalls.length - 1]?.[1];
}

describe('deleteAccount — Task 278: luồng Apple đo cổng AD-12, đúng bảng 8 kết cục', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlertCalls.length = 0;
    mockNextChoice = 'Tiếp tục';
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn() as unknown as typeof fetch;
    (Alert.alert as jest.Mock).mockImplementation(
      (title: string, message?: string, buttons?: MockAlertButton[]) => {
        mockAlertCalls.push([title, message, buttons]);
        if (buttons && buttons.length > 0) {
          const target =
            buttons.find((b) => b.text === mockNextChoice) ?? buttons[buttons.length - 1];
          target.onPress?.();
        }
      },
    );
  });

  it('BO QUA: bấm "Bỏ qua bước này" ở màn giải thích → không gọi Apple, không gọi Worker', async () => {
    mockNextChoice = 'Bỏ qua bước này';
    await signInAndDeleteAsApple();

    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(lastAlertMessage()).toBe('CONG AD-12: BO QUA');
    await expectLocalDataFullyCleared();
  });

  it('NGUOI DUNG HUY: huỷ hộp thoại Apple → không gọi Worker', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_CANCELED',
    });
    await signInAndDeleteAsApple();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(lastAlertMessage()).toBe('CONG AD-12: NGUOI DUNG HUY');
    await expectLocalDataFullyCleared();
  });

  it('KHONG CO MA (Apple trả code null) → không gọi Worker', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: null,
    });
    await signInAndDeleteAsApple();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(lastAlertMessage()).toBe('CONG AD-12: KHONG CO MA');
    await expectLocalDataFullyCleared();
  });

  it('KHONG CO MA (signInAsync ném lỗi không phải huỷ, vd ERR_REQUEST_UNKNOWN) → gộp cùng dòng "khong co ma"', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_UNKNOWN',
    });
    await signInAndDeleteAsApple();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(lastAlertMessage()).toBe('CONG AD-12: KHONG CO MA');
    await expectLocalDataFullyCleared();
  });

  it('DAT: Apple chấp nhận, co refresh token — và body gửi lên Worker đúng {"token": "..."}', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: FRESH_CODE,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      mockWorkerJsonResponse({ stage: 'apple_token', apple_status: 200, co_refresh_token: true }),
    );

    await signInAndDeleteAsApple();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: FRESH_CODE }),
      }),
    );
    expect(lastAlertMessage()).toBe('CONG AD-12: DAT — apple_status 200, co refresh token');
    await expectLocalDataFullyCleared();
  });

  it('LA: Apple chấp nhận, KHONG co refresh token', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: FRESH_CODE,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      mockWorkerJsonResponse({ stage: 'apple_token', apple_status: 200, co_refresh_token: false }),
    );

    await signInAndDeleteAsApple();

    expect(lastAlertMessage()).toBe('CONG AD-12: LA — apple_status 200, KHONG co refresh token');
    await expectLocalDataFullyCleared();
  });

  it('TRUOT: Apple từ chối ở /auth/token (invalid_grant) — error hiện NGUYÊN VĂN', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: FRESH_CODE,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      mockWorkerJsonResponse({
        stage: 'apple_token',
        apple_status: 400,
        error: 'invalid_grant',
        apple_body: '{"error":"invalid_grant"}',
      }),
    );

    await signInAndDeleteAsApple();

    expect(lastAlertMessage()).toBe('CONG AD-12: TRUOT — invalid_grant');
    await expectLocalDataFullyCleared();
  });

  it('LOI WORKER: Worker chặn ở biên (thiếu/sai trường) — error hiện NGUYÊN VĂN', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: FRESH_CODE,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      mockWorkerJsonResponse({ stage: 'worker', error: 'invalid_request', message: 'thieu truong token' }),
    );

    await signInAndDeleteAsApple();

    expect(lastAlertMessage()).toBe('CONG AD-12: LOI WORKER — invalid_request');
    await expectLocalDataFullyCleared();
  });

  it('KHONG GOI DUOC: fetch ném lỗi CẢ hai lần thử (tối đa một lần thử lại — AD-5)', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: FRESH_CODE,
    });
    (globalThis.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed: ENOTFOUND'));

    await signInAndDeleteAsApple();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // thử + đúng một lần thử lại
    expect(lastAlertMessage()).toBe('CONG AD-12: KHONG GOI DUOC — TypeError');
    await expectLocalDataFullyCleared();
  });
});
