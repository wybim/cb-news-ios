/// <reference types="jest" />
/**
 * Task 278 (BLI 258, đợt 3g): thay `appleAuth.probe.test.ts` (Task 275, đã gỡ cùng
 * `probeSecondAppleSignIn()`) — kiểm `getFreshAppleRevocationCode()`, hàm đo cổng
 * `AD-12` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`). Khác Task 275: nhánh 'has-code' nay
 * PHẢI mang giá trị `code` thật (luồng xoá cần gửi nó lên Worker), không chỉ `length`.
 *
 * Mock `expo-apple-authentication` để dựng cả 4 tình huống `signInAsync()` lần hai có
 * thể trả về (có mã / không mã / người dùng huỷ / lỗi khác) — không cần thiết bị hay
 * simulator thật, cùng mẫu `deleteAccount.apple-flow.test.ts`.
 */

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import { getFreshAppleRevocationCode } from '../appleAuth';

describe('getFreshAppleRevocationCode — Task 278: cổng đo AD-12', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('có mã: trả kind=has-code kèm CẢ giá trị mã lẫn độ dài đúng', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: 'ma-uy-quyen-gia-lap-dai-27-ky-tu',
    });
    const result = await getFreshAppleRevocationCode();
    expect(result).toEqual({
      kind: 'has-code',
      code: 'ma-uy-quyen-gia-lap-dai-27-ky-tu',
      length: 'ma-uy-quyen-gia-lap-dai-27-ky-tu'.length,
    });
  });

  it('không mã: Apple trả authorizationCode rỗng/null → kind=no-code', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      fullName: null,
      email: null,
      user: 'apple-user-id-thu-nghiem',
      authorizationCode: null,
    });
    const result = await getFreshAppleRevocationCode();
    expect(result).toEqual({ kind: 'no-code' });
  });

  it('người dùng huỷ hộp thoại Apple → kind=cancelled', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_CANCELED',
    });
    const result = await getFreshAppleRevocationCode();
    expect(result).toEqual({ kind: 'cancelled' });
  });

  it('lỗi khác (không phải huỷ) → kind=error kèm tên lỗi, không kèm chi tiết nhạy cảm', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_UNKNOWN',
    });
    const result = await getFreshAppleRevocationCode();
    expect(result).toEqual({ kind: 'error', errorName: 'ERR_REQUEST_UNKNOWN' });
  });

  it('lỗi mạng thật (không có .code, ví dụ TypeError) → kind=error dùng err.name', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(
      new TypeError('network unreachable'),
    );
    const result = await getFreshAppleRevocationCode();
    expect(result).toEqual({ kind: 'error', errorName: 'TypeError' });
  });
});
