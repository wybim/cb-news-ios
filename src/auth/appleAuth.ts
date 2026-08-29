import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * Sign in with Apple KHÔNG cần "client ID" cấu hình phía app (khác Google) — chỉ cần
 * bật capability "Sign In with Apple" trên App ID com.cbcentres.cbnews tại Apple
 * Developer portal, việc chủ dự án đang làm. Ở đây "chưa sẵn sàng" được gate bằng
 * `isAvailableAsync()` (điều kiện thiết bị/OS) cộng try/catch quanh `signInAsync()`
 * (mọi lỗi khác, kể cả capability chưa bật trên portal) — không có biến môi trường
 * riêng cho Apple.
 */

/**
 * Task 278 (BLI 258, đợt 3g — gỡ nợ AD-11): khoá này KHÔNG còn được ghi lúc đăng nhập
 * và KHÔNG còn được đọc lúc xoá tài khoản (xem `ad2-phan-dinh-man-xoa-va-ten-mien.md`,
 * `AD-2` + `AD-11` — mã uỷ quyền sống 5 phút nên cất từ lúc đăng nhập rồi dùng lúc xoá
 * là sai loại, luôn gửi mã đã chết). Hằng số vẫn PHẢI export và PHẢI còn trong
 * `LOCAL_USER_DATA_KEYS` (src/data/localUserData.ts dòng 30) — đó là việc DỌN khoá cũ
 * còn sót trên máy đã cài bản trước Task 278 (Task 274/275), không phải việc đang dùng.
 */
export const APPLE_AUTH_CODE_STORAGE_KEY = 'cbnews.appleAuthorizationCode.v1';

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

/**
 * Task 278 (BLI 258, đợt 3g): cổng đo `AD-12` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`)
 * — thay cho `probeSecondAppleSignIn()` của Task 275 (đã gỡ). Task 275 chỉ đo "Apple
 * có trả mã không" (kèm `length`, không lộ giá trị). `AD-12` chốt câu hỏi chịu lực còn
 * lại là "mã đó có ĐỔI ĐƯỢC ở `/auth/token` không" — muốn đo được câu đó thì luồng xoá
 * tài khoản phải GỬI THẬT giá trị mã lên Worker chặng 1, nên hàm này phải trả về mã
 * thật, khác hẳn rào Task 275.
 *
 * Rào an toàn KHÔNG đổi, chỉ đổi CHỖ áp dụng: giá trị `code` chỉ được dùng đúng một
 * việc — làm body gửi lên Worker trong cùng một luồng ngay sau khi gọi hàm này (F3:
 * mã sống 5 phút, không cất, không chờ) — KHÔNG BAO GIỜ được hiện lên Alert/UI hay ghi
 * log ở bất kỳ lớp gọi nào phía trên; chỉ `length` được phép hiện/log.
 *
 * Hàm THUẦN LOGIC, không đụng Alert/UI — test được bằng cách mock
 * `expo-apple-authentication`, không cần thiết bị hay simulator thật.
 */
export type AppleFreshCodeResult =
  | { kind: 'has-code'; code: string; length: number }
  | { kind: 'no-code' }
  | { kind: 'cancelled' }
  | { kind: 'error'; errorName: string };

export async function getFreshAppleRevocationCode(): Promise<AppleFreshCodeResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const code = credential.authorizationCode;
    return code ? { kind: 'has-code', code, length: code.length } : { kind: 'no-code' };
  } catch (err: unknown) {
    const errCode = (err as { code?: string } | null)?.code;
    if (errCode === 'ERR_REQUEST_CANCELED') {
      return { kind: 'cancelled' };
    }
    const errorName = errCode ?? (err instanceof Error ? err.name : 'unknown');
    return { kind: 'error', errorName };
  }
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
    // Task 278 (gỡ nợ AD-11): KHÔNG còn cất `authorizationCode` ở đây. Mã sống 5 phút
    // (AD-2) nên cất lúc đăng nhập rồi dùng lúc xoá luôn là mã đã chết — đúng lỗi Task
    // 274 để lại. Luồng xoá tài khoản (`deleteAccount.ts`) tự xin mã MỚI tại chỗ qua
    // `getFreshAppleRevocationCode()`, không đọc từ đây.
    return { ok: true, displayName, providerUserId: credential.user };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error' };
  }
}
