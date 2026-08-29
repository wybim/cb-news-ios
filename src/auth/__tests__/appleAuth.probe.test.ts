/// <reference types="jest" />
/**
 * Task 275 (BLI 258, đợt 3e — bản THĂM DÒ): kiểm 4 nhánh của `probeSecondAppleSignIn()`
 * — hàm đo trụ chịu lực của AD-2, xem `ad-luong-token-apple.md` mục 7 điều-chưa-biết #1.
 *
 * Mock `expo-apple-authentication` để dựng cả 4 tình huống mà `signInAsync()` lần hai
 * có thể trả về (có mã / không mã / người dùng huỷ / lỗi khác) — không cần thiết bị
 * hay simulator thật, cùng mẫu với `deleteAccount.worker-failure.test.ts`.
 *
 * Rào an toàn Task 275 được kiểm TẠI ĐÂY bằng cấu trúc kiểu dữ liệu, không phải bằng
 * grep: `AppleSignInProbeResult` không có nhánh nào mang trường chứa giá trị mã —
 * nhánh 'has-code' chỉ có `length` (number), nên TypeScript tự chặn việc lỡ tay trả
 * nguyên `authorizationCode` ra khỏi hàm.
 */

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import { probeSecondAppleSignIn } from '../appleAuth';

describe('probeSecondAppleSignIn — Task 275: đo trụ chịu lực AD-2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('có mã: trả kind=has-code kèm ĐÚNG độ dài, không kèm giá trị mã', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: 'ma-uy-quyen-gia-lap-dai-27-ky-tu',
    });
    const result = await probeSecondAppleSignIn();
    expect(result).toEqual({ kind: 'has-code', length: 'ma-uy-quyen-gia-lap-dai-27-ky-tu'.length });
    // Đối tượng trả về không có bất kỳ trường nào khác ngoài kind/length — không có
    // đường nào để giá trị mã lọt ra theo object này.
    expect(Object.keys(result)).toEqual(['kind', 'length']);
  });

  it('không mã: Apple trả authorizationCode rỗng/null → kind=no-code', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: null,
    });
    const result = await probeSecondAppleSignIn();
    expect(result).toEqual({ kind: 'no-code' });
  });

  it('người dùng huỷ hộp thoại Apple → kind=cancelled', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_CANCELED',
    });
    const result = await probeSecondAppleSignIn();
    expect(result).toEqual({ kind: 'cancelled' });
  });

  it('lỗi khác (không phải huỷ) → kind=error kèm tên lỗi, không kèm chi tiết nhạy cảm', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_UNKNOWN',
    });
    const result = await probeSecondAppleSignIn();
    expect(result).toEqual({ kind: 'error', errorName: 'ERR_REQUEST_UNKNOWN' });
  });

  it('lỗi mạng thật (không có .code, ví dụ TypeError) → kind=error dùng err.name', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(
      new TypeError('network unreachable'),
    );
    const result = await probeSecondAppleSignIn();
    expect(result).toEqual({ kind: 'error', errorName: 'TypeError' });
  });
});
