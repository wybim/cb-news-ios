import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { googleIosClientId, isGoogleSignInConfigured } from '../config/env';

let configured = false;

/** Chỉ gọi GoogleSignin.configure() khi có client ID thật — thiếu biến thì KHÔNG cấu hình. */
function ensureConfigured(): boolean {
  if (!isGoogleSignInConfigured()) return false;
  if (!configured) {
    GoogleSignin.configure({ iosClientId: googleIosClientId });
    configured = true;
  }
  return true;
}

export type GoogleSignInResult =
  | { ok: true; displayName: string; providerUserId: string }
  | { ok: false; reason: 'not-configured' | 'cancelled' | 'error' };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!ensureConfigured()) {
    return { ok: false, reason: 'not-configured' };
  }
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { ok: false, reason: 'cancelled' };
    }
    const { user } = response.data;
    return {
      ok: true,
      displayName: user.name ?? user.email,
      providerUserId: user.id,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error' };
  }
}

/** Đăng xuất — chỉ ngắt phiên native, KHÔNG thu hồi quyền đã cấp (khác revokeGoogleAccess). */
export async function signOutGoogleSession(): Promise<void> {
  if (!configured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // không chặn đăng xuất cục bộ nếu SDK Google lỗi (vd mất mạng)
  }
}

/** Dùng khi XOÁ TÀI KHOẢN — thu hồi quyền truy cập đã cấp cho app, mạnh hơn signOut. */
export async function revokeGoogleAccess(): Promise<void> {
  if (!configured) return;
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // best-effort: thu hồi phía Google thất bại (vd mất mạng) không được chặn xoá dữ
    // liệu cục bộ — dữ liệu trên máy vẫn phải xoá được ngay cả khi offline.
  }
  await signOutGoogleSession();
}
