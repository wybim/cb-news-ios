import { Alert } from 'react-native';
import { accountStore } from '../state/accountStore';
import { clearAllLocalUserData } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';
import { getFreshAppleRevocationCode } from './appleAuth';

/**
 * Worker Cloudflare thu hồi token Apple (Task 265 → Task 277, BLI 258) — sống tại đây,
 * KHÔNG sửa mã nguồn của nó ở task này (chỉ đọc để khớp giao diện). Từ Task 277, Worker
 * đổi việc BÊN TRONG cùng một đường dẫn `POST /revoke`: đây là CHẶNG 1 của `AD-12`
 * (`ad2-phan-dinh-man-xoa-va-ten-mien.md`) — đổi `authorizationCode` lấy `refresh_token`
 * ở `https://appleid.apple.com/auth/token`, KHÔNG gọi `/auth/revoke` (chặng 2 chưa viết).
 * Trường body JSON đúng như Worker `src/cb-news-api-worker/src/index.js` (hàm
 * `xuLyDoiMa`) chờ: `token` (string, bắt buộc) — KHÔNG phải `authorizationCode` hay `code`.
 *
 * Ba nhánh phản hồi thật (PM đã tự đo bằng `curl`, xem comment giao hàng của Task 278):
 *   - `{stage:"worker", error, message}` — Worker chặn ở biên (thiếu/sai trường, cấu
 *     hình chưa sẵn sàng), KHÔNG gọi ra Apple.
 *   - `{stage:"apple_token", apple_status, error, apple_body}` — Apple từ chối ở
 *     `/auth/token` (vd `invalid_grant`, `invalid_client`) HOẶC Worker không gọi được
 *     Apple (`apple_unreachable`) — `error` là NGUYÊN VĂN, chép thẳng không diễn giải.
 *   - `{stage:"apple_token", apple_status:200, co_refresh_token:true|false}` — Apple
 *     chấp nhận. KHÔNG BAO GIỜ có chuỗi token trong response (giữ `AD-1`).
 */
const APPLE_REVOKE_WORKER_URL = 'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke';

type WorkerChang1Outcome =
  | { kind: 'apple-accepted'; hasRefreshToken: boolean }
  | { kind: 'apple-rejected'; error: string }
  | { kind: 'worker-edge'; error: string }
  | { kind: 'unreachable'; errorName: string };

/**
 * Gửi mã lên Worker chặng 1. Ngân sách thời gian TỔNG ≤ 10 giây, tối đa MỘT lần thử
 * lại (`AD-5`) — chia đều 5s/5s: đây là LỰA CHỌN KỸ THUẬT đơn giản, không phải số đo
 * (chính `AD-5` ghi rõ con số 10s là ước lượng, không phải số đo — xem mục "Chi tiết
 * từng AD" của `ad-luong-token-apple.md`). Retry CHỈ áp dụng khi bản thân `fetch()` ném
 * lỗi (mạng đứt, Worker không phản hồi, bị abort) — KHÔNG retry khi đã nhận được một
 * response thật từ Worker (kể cả Apple từ chối 502), vì đó đã là một câu trả lời hợp lệ
 * cần đo, không phải một lần gọi thất bại.
 */
async function postToWorkerChang1(code: string): Promise<WorkerChang1Outcome> {
  const attempt = async (budgetMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      return await fetch(APPLE_REVOKE_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let resp: Response;
  try {
    resp = await attempt(5000);
  } catch {
    try {
      resp = await attempt(5000); // tối đa một lần thử lại — AD-5
    } catch (secondErr: unknown) {
      const errorName = secondErr instanceof Error ? secondErr.name : 'unknown';
      return { kind: 'unreachable', errorName };
    }
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch {
    // Phản hồi không phải JSON hợp lệ — không đúng hợp đồng Worker đã đo, coi là lỗi
    // biên (nhánh phòng thủ, không kỳ vọng xảy ra với Worker thật).
    return { kind: 'worker-edge', error: 'invalid_json_response' };
  }

  const body = payload as {
    stage?: string;
    apple_status?: number;
    error?: string;
    co_refresh_token?: boolean;
  };

  if (body.stage === 'worker') {
    return { kind: 'worker-edge', error: body.error ?? 'unknown_worker_error' };
  }
  if (body.stage === 'apple_token' && body.apple_status === 200) {
    return { kind: 'apple-accepted', hasRefreshToken: body.co_refresh_token === true };
  }
  if (body.stage === 'apple_token') {
    return { kind: 'apple-rejected', error: body.error ?? 'unknown_apple_error' };
  }
  return { kind: 'worker-edge', error: 'unexpected_response_shape' };
}

/** Hiện đúng một dòng kết quả thật — khuôn chữ theo bảng Task 278, không dấu, giống bản thăm dò Task 275. */
function showOutcome(message: string): void {
  Alert.alert('Kết quả đo cổng AD-12', message);
}

/**
 * Luồng xoá tài khoản Apple, đúng thứ tự `AD-10` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`):
 * ① màn xác nhận xoá của app (đã có, ở `HomeScreen.tsx`, KHÔNG đụng ở đây) → ② màn giải
 * thích MỚI, hiện TRƯỚC khi gọi Apple → ③ `signInAsync()` xin mã mới (huỷ → nhảy bước
 * hiện kết quả) → ④ POST mã lên Worker chặng 1, hiện kết quả thật → (bước ⑤ xoá dữ liệu
 * nằm NGOÀI hàm này, ở `deleteAccount()`, vô điều kiện — AD-5).
 *
 * QUY TẮC QUAN TRỌNG NHẤT: hàm này KHÔNG BAO GIỜ được throw ra ngoài, đúng AD-5 — bọc
 * toàn bộ bằng một lớp try/catch ngoài cùng, phòng cả lỗi bất thường lọt ra từ chính
 * `Alert.alert` hay `getFreshAppleRevocationCode()`, để `deleteAccount()` LUÔN chạy tiếp
 * tới bước xoá dữ liệu dù nhánh này hỏng kiểu gì. Phép thử ép nhánh này ném lỗi, xem
 * `deleteAccount.network-failure.test.ts`.
 */
async function runAppleRevocationFlow(): Promise<void> {
  try {
    const choice = await new Promise<'continue' | 'skip'>((resolve) => {
      Alert.alert(
        'Trước khi tiếp tục',
        'iPhone sắp hiện hộp thoại xác nhận với Apple. Ứng dụng chỉ dùng nó để lấy mã ' +
          'yêu cầu thu hồi quyền đăng nhập, rồi gửi ngay mã đó đi — không lưu lại. Nếu ' +
          'bạn bỏ qua bước này, dữ liệu trên máy vẫn được xoá đầy đủ.',
        [
          { text: 'Bỏ qua bước này', style: 'cancel', onPress: () => resolve('skip') },
          { text: 'Tiếp tục', onPress: () => resolve('continue') },
        ],
      );
    });

    if (choice === 'skip') {
      showOutcome('CONG AD-12: BO QUA');
      return;
    }

    const fresh = await getFreshAppleRevocationCode();
    if (fresh.kind === 'cancelled') {
      showOutcome('CONG AD-12: NGUOI DUNG HUY');
      return;
    }
    if (fresh.kind === 'no-code' || fresh.kind === 'error') {
      // Gộp 'no-code' và 'error' vào cùng một dòng: bảng brief chỉ có một dòng "Apple
      // không trả mã" cho việc không có mã dùng được để gửi đi, bất kể lý do (Apple trả
      // null, hay `signInAsync()` ném lỗi không phải huỷ). Nêu rõ diễn giải này trong
      // comment giao hàng Task 278.
      showOutcome('CONG AD-12: KHONG CO MA');
      return;
    }

    const outcome = await postToWorkerChang1(fresh.code);
    switch (outcome.kind) {
      case 'apple-accepted':
        showOutcome(
          outcome.hasRefreshToken
            ? 'CONG AD-12: DAT — apple_status 200, co refresh token'
            : 'CONG AD-12: LA — apple_status 200, KHONG co refresh token',
        );
        break;
      case 'apple-rejected':
        showOutcome(`CONG AD-12: TRUOT — ${outcome.error}`);
        break;
      case 'worker-edge':
        showOutcome(`CONG AD-12: LOI WORKER — ${outcome.error}`);
        break;
      case 'unreachable':
        showOutcome(`CONG AD-12: KHONG GOI DUOC — ${outcome.errorName}`);
        break;
    }
  } catch {
    // Nuốt lỗi có chủ đích — xem ghi chú trên. Luồng đo AD-12 không được chặn việc xoá.
  }
}

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy, gồm cả
 * bài đã lưu đọc offline (Task 267) chứ không chỉ dữ liệu tài khoản.
 *
 * Khác signOutCurrentSession(): với Google còn thu hồi quyền truy cập (revokeAccess)
 * chứ không chỉ ngắt phiên; với Apple, từ Task 278, còn chạy luồng đo cổng `AD-12`
 * (`runAppleRevocationFlow()`) gửi mã MỚI lên Worker chặng 1. Cả hai nhánh provider đều
 * best-effort — lỗi thu hồi phía nào cũng KHÔNG được chặn phần xoá dữ liệu tại chỗ
 * (`clearAllLocalUserData` + `signOut` luôn chạy tiếp, nằm ngoài mọi try/catch ở trên).
 */
export async function deleteAccount(): Promise<void> {
  const current = accountStore.getState();
  if (current.status === 'signed-in' && current.provider === 'google') {
    await revokeGoogleAccess();
  }
  if (current.status === 'signed-in' && current.provider === 'apple') {
    await runAppleRevocationFlow();
  }
  // Xoá TẤT CẢ khoá đã đăng ký ở LOCAL_USER_DATA_KEYS (mọi backend) — nguồn duy nhất,
  // không tự lặp SecureStore ở đây để tránh quên khoá mới (đúng bẫy brief Task 267 cảnh báo).
  await clearAllLocalUserData();
  await accountStore.signOut();
}
