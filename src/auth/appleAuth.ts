import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Sign in with Apple KHÔNG cần "client ID" cấu hình phía app (khác Google) — chỉ cần
 * bật capability "Sign In with Apple" trên App ID com.cbcentres.cbnews tại Apple
 * Developer portal, việc chủ dự án đang làm. Ở đây "chưa sẵn sàng" được gate bằng
 * `isAvailableAsync()` (điều kiện thiết bị/OS) cộng try/catch quanh `signInAsync()`
 * (mọi lỗi khác, kể cả capability chưa bật trên portal) — không có biến môi trường
 * riêng cho Apple.
 */

/**
 * Task 274 (BLI 258, DoD "nối app vào Worker thu hồi token Apple"): Apple bắt buộc app
 * dùng Sign in with Apple phải gọi REST API thu hồi token khi xoá tài khoản (technote
 * TN3194) — muốn gọi được thì phải GIỮ `authorizationCode` từ lúc đăng nhập, vì Apple
 * chỉ cấp mã này đúng một lần tại đây. Trước bản vá này app lấy `credential` nhưng chỉ
 * dùng fullName/email/user rồi vứt bỏ authorizationCode — lỗ hổng gốc của Task 274.
 *
 * Cất vào Keychain (expo-secure-store) qua khoá RIÊNG, tách khỏi `accountStore`'s
 * ACCOUNT_STORAGE_KEY — không nhét vào cùng bản ghi tài khoản để tránh việc đọc trạng
 * thái tài khoản (`accountStore.getState()`, in ra UI/log ở bất kỳ đâu) vô tình kéo
 * theo mã uỷ quyền. Khoá này PHẢI có trong `LOCAL_USER_DATA_KEYS`
 * (src/data/localUserData.ts) — thiếu đăng ký thì xoá tài khoản sẽ để sót nó lại.
 */
export const APPLE_AUTH_CODE_STORAGE_KEY = 'cbnews.appleAuthorizationCode.v1';

/** Đọc lại mã uỷ quyền đã lưu — dùng lúc xoá tài khoản để gọi Worker thu hồi token. */
export async function getAppleAuthorizationCode(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(APPLE_AUTH_CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export type AppleSignInResult =
  | { ok: true; displayName: string; providerUserId: string }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'error' };

export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function formatFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null | undefined,
): string | null {
  if (!fullName) return null;
  const parts = [fullName.givenName, fullName.familyName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  const available = await isAppleSignInAvailable();
  if (!available) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    // Apple chỉ trả fullName/email ở lần đăng nhập ĐẦU TIÊN trên thiết bị; ta lưu lại
    // ngay lần đó vào accountStore, các lần sau đọc từ bản ghi cục bộ, không hỏi lại Apple.
    const displayName =
      formatFullName(credential.fullName) ?? credential.email ?? 'Người dùng Apple';
    // Giữ authorizationCode để lúc xoá tài khoản gọi được Worker thu hồi token (Task
    // 274) — best-effort: lưu KHÔNG thành công (hiếm, lỗi Keychain) không được chặn cả
    // luồng đăng nhập, người dùng vẫn đăng nhập được, chỉ mất khả năng thu hồi sau này.
    // KHÔNG log giá trị `code` ra bất kỳ đâu (rào an toàn Task 274).
    if (credential.authorizationCode) {
      try {
        await SecureStore.setItemAsync(
          APPLE_AUTH_CODE_STORAGE_KEY,
          credential.authorizationCode,
        );
      } catch {
        // nuốt lỗi có chủ đích — xem ghi chú trên
      }
    }
    return { ok: true, displayName, providerUserId: credential.user };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error' };
  }
}
