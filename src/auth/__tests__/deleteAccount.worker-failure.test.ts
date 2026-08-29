/// <reference types="jest" />
/**
 * Task 274 (BLI 258) — DoD "trượt được": chứng minh lỗi gọi Worker thu hồi token Apple
 * KHÔNG được chặn việc xoá dữ liệu tại chỗ. Đây là rào quan trọng nhất của task: Apple
 * (technote TN3194) ghi rõ không thu hồi được thì vẫn phải hoàn tất xoá tài khoản.
 *
 * Test này mô phỏng "địa chỉ Worker sai" bằng cách cho `fetch` toàn cục reject với lỗi
 * mạng thật (TypeError, đúng loại lỗi fetch ném khi DNS/host không tồn tại) — KHÔNG né
 * tránh lỗi, để chứng minh nhánh catch trong `deleteAccount.ts` chạy đúng.
 *
 * Chỉ mock các module NATIVE (Expo/RN) không chạy được trên Node thuần — logic thật của
 * `appleAuth.ts`, `deleteAccount.ts`, `localUserData.ts`, `accountStore.ts` được require
 * và chạy y hệt mã sẽ lên app (đo đúng đối tượng, không đo bản sao — xem kb/lessons/
 * 2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md).
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

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
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

// Task 275: deleteAccount() nhánh Apple giờ còn chạy bước thăm dò
// (runDeleteAccountProbe()), hiện kết quả qua Alert.alert — cần mock 'react-native' để
// require() không đụng vào mã gốc chưa qua Metro transform (test này KHÔNG tập trung
// vào bước thăm dò, chỉ cần không vỡ vì import mới — xem deleteAccount.probe-failure.test.ts
// và appleAuth.probe.test.ts để kiểm bước thăm dò).
jest.mock('react-native', () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { signInWithApple, getAppleAuthorizationCode } from '../appleAuth';
import { accountStore } from '../../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../../data/localUserData';
import { deleteAccount } from '../deleteAccount';

describe('deleteAccount — Task 274: lỗi gọi Worker không chặn việc xoá', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('vẫn xoá sạch dữ liệu cục bộ và đăng xuất dù Worker không gọi được (địa chỉ sai)', async () => {
    // Mô phỏng "địa chỉ Worker sai" — DNS/host không tồn tại ném TypeError, đúng hành vi
    // thật của fetch (Node/React Native) khi không resolve được host.
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: ENOTFOUND worker-sai.invalid'));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    // 1. Đăng nhập Apple THẬT qua signInWithApple() (không tự nhét mã tay) để
    //    authorizationCode được lưu đúng đường mã thật sẽ chạy trên app.
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: 'nguoidung@thu-nghiem.local',
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: 'ma-uy-quyen-thu-nghiem-abc123',
    });
    const signInResult = await signInWithApple();
    expect(signInResult).toEqual(
      expect.objectContaining({ ok: true, providerUserId: 'apple-user-id-thu-nghiem' }),
    );
    await expect(getAppleAuthorizationCode()).resolves.toBe('ma-uy-quyen-thu-nghiem-abc123');

    await accountStore.signIn({
      provider: 'apple',
      displayName: 'Nguoi Dung Thu Nghiem',
      providerUserId: 'apple-user-id-thu-nghiem',
    });

    // 2. Xoá tài khoản trong khi Worker không gọi được — hàm KHÔNG được throw.
    await expect(deleteAccount()).resolves.toBeUndefined();

    // 3. Đối chiếu tên trường: app phải gửi đúng {"token": "..."} như Worker thật chờ
    //    (src/cb-news-api-worker/src/index.js, hàm xuLyRevoke) — KHÔNG phải "code" hay
    //    "authorizationCode".
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'ma-uy-quyen-thu-nghiem-abc123' }),
      }),
    );

    // 4. Bằng chứng chính của DoD: MỌI khoá đã đăng ký ở LOCAL_USER_DATA_KEYS (gồm cả
    //    khoá authorizationCode mới) đã bị xoá thật, và tài khoản đã đăng xuất — dù
    //    bước gọi Worker ở trên đã lỗi.
    for (const entry of LOCAL_USER_DATA_KEYS) {
      if (entry.backend === 'secure-store') {
        await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
      }
    }
    expect(accountStore.getState()).toEqual({ status: 'signed-out' });
  });
});
