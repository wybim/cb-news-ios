import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * Sign in with Apple KHÔNG cần "client ID" cấu hình phía app (khác Google) — chỉ cần
 * bật capability "Sign In with Apple" trên App ID com.cbcentres.cbnews tại Apple
 * Developer portal, việc chủ dự án đang làm. Ở đây "chưa sẵn sàng" được gate bằng
 * `isAvailableAsync()` (điều kiện thiết bị/OS) cộng try/catch quanh `signInAsync()`
 * (mọi lỗi khác, kể cả capability chưa bật trên portal) — không có biến môi trường
 * riêng cho Apple.
 */

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
    return { ok: true, displayName, providerUserId: credential.user };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error' };
  }
}
