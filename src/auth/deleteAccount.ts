import { Alert } from 'react-native';
import { accountStore } from '../state/accountStore';
import { clearAllLocalUserData } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';
import { getFreshAppleRevocationCode } from './appleAuth';

/**
 * Worker Cloudflare thu hồi token Apple (Task 265 → 277 → 279, BLI 258) — sống tại đây,
 * KHÔNG sửa mã nguồn của nó ở task này (chỉ đọc để khớp giao diện). Từ Task 279, Worker
 * làm ĐỦ HAI CHẶNG của `AD-12` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`) trong CÙNG một
 * request `POST /revoke`: chặng 1 đổi `authorizationCode` lấy `refresh_token` ở
 * `https://appleid.apple.com/auth/token`, chặng 2 gọi luôn `/auth/revoke` nếu có
 * `refresh_token`. Trường body JSON đúng như Worker `src/cb-news-api-worker/src/index.js`
 * (hàm `xuLyDoiMa`) chờ: `token` (string, bắt buộc) — KHÔNG phải `authorizationCode` hay
 * `code`.
 *
 * Năm nhánh phản hồi thật (Task 281, PM đã tự đo bằng `curl` lúc 08:20 30/08, sau khi
 * chặng 2 lên):
 *   1. `{stage:"worker", error, message}` — Worker chặn ở biên (thiếu/sai trường, cấu
 *      hình chưa sẵn sàng), KHÔNG gọi ra Apple.
 *   2. `{stage:"apple_token", apple_status, error, apple_body}` — Apple từ chối ĐỔI MÃ ở
 *      `/auth/token` (vd `invalid_grant`, `invalid_client`) HOẶC Worker không gọi được
 *      Apple (`apple_unreachable`).
 *   3. `{stage:"apple_token", apple_status:200, co_refresh_token:false}` — đổi mã xong
 *      nhưng Apple không cấp `refresh_token`; Worker KHÔNG gọi `/auth/revoke` vì không có
 *      gì để thu hồi.
 *   4. `{stage:"apple_revoke", apple_status:200, revoked:true, co_refresh_token:true}` —
 *      thu hồi THÀNH CÔNG. Đây là NHÁNH DUY NHẤT app được phép nói "đã thu hồi" (`AD-6`).
 *   5. `{stage:"apple_revoke", apple_status:<số thật>, revoked:false, ...}` — thu hồi
 *      THẤT BẠI.
 * KHÔNG BAO GIỜ có chuỗi token trong response (giữ `AD-1`).
 *
 * `AD-6`, nguyên văn: "App chỉ hiện chữ đã thu hồi khi `revoked === true`; ngược lại
 * hiện hướng dẫn tự thu hồi trong Cài đặt" và "Không bao giờ báo thành công thay Apple."
 * Vì bốn trong năm nhánh trên (1, 2, 3, 5) đều dẫn tới CÙNG một chữ cho người dùng —
 * "chưa thu hồi được" — hàm dưới đây cố ý CHỈ trả về đúng một cờ `revoked: boolean`,
 * đọc thẳng từ trường `revoked` của Worker, không phân loại lý do. Phân loại lý do
 * (`stage`, `apple_status`, `error`) là chữ đo cho kỹ sư, không phải chữ cho người dùng —
 * xem `showOutcome()`.
 */
const APPLE_REVOKE_WORKER_URL = 'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke';

/**
 * Gửi mã lên Worker (chặng 1 + chặng 2, cùng một request). Ngân sách thời gian TỔNG ≤ 10
 * giây, tối đa MỘT lần thử lại (`AD-5`) — chia đều 5s/5s: đây là LỰA CHỌN KỸ THUẬT đơn
 * giản, không phải số đo (chính `AD-5` ghi rõ con số 10s là ước lượng, không phải số đo
 * — xem mục "Chi tiết từng AD" của `ad-luong-token-apple.md`). Retry CHỈ áp dụng khi bản
 * thân `fetch()` ném lỗi (mạng đứt, Worker không phản hồi, bị abort) — KHÔNG retry khi đã
 * nhận được một response thật từ Worker (kể cả Apple từ chối), vì đó đã là một câu trả
 * lời hợp lệ cần đo, không phải một lần gọi thất bại.
 *
 * Trả `{ revoked: false }` cho MỌI trường hợp không phải nhánh 4 ở trên (lỗi biên Worker,
 * Apple từ chối đổi mã, không có refresh token để thu hồi, thu hồi thất bại, hoặc không
 * gọi được Worker) — không throw, để `runAppleRevocationFlow()` luôn có một kết quả để
 * hiện cho người dùng.
 */
async function requestAppleRevoke(code: string): Promise<{ revoked: boolean }> {
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
    } catch {
      return { revoked: false };
    }
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch {
    // Phản hồi không phải JSON hợp lệ — không đúng hợp đồng Worker đã đo. Không phải
    // nhánh 4, nên không được nói "đã thu hồi" (AD-6).
    return { revoked: false };
  }

  const body = payload as { revoked?: boolean };
  return { revoked: body.revoked === true };
}

/**
 * Hiện đúng MỘT trong hai chữ thật cho người dùng — không hiện mã lỗi kỹ thuật, không
 * hiện `stage`/`apple_status`/`error` (Task 281). `revoked` phải là `true` CHỈ khi Worker
 * trả đúng nhánh 4 (`revoked === true`) — luật `AD-6`, không phải gợi ý: không bao giờ
 * báo thành công thay Apple.
 */
function showOutcome(revoked: boolean): void {
  const message = revoked
    ? 'Dữ liệu trên máy đã xoá xong. Quyền đăng nhập bằng Apple của ứng dụng cũng đã được thu hồi.'
    : 'Dữ liệu trên máy đã xoá xong. Chưa thu hồi được quyền đăng nhập bằng Apple — bạn có thể ' +
      'tự thu hồi trong Cài đặt → tên Apple ID ở trên cùng → Đăng nhập & Bảo mật → Đăng nhập ' +
      'bằng Apple → chọn CB News → Ngừng dùng Apple ID.';
  Alert.alert('Đã xoá tài khoản', message);
}

/**
 * Luồng xoá tài khoản Apple, đúng thứ tự `AD-10` (`ad2-phan-dinh-man-xoa-va-ten-mien.md`):
 * ① màn xác nhận xoá của app (đã có, ở `HomeScreen.tsx`, KHÔNG đụng ở đây) → ② màn giải
 * thích MỚI, hiện TRƯỚC khi gọi Apple → ③ `signInAsync()` xin mã mới (huỷ → nhảy bước
 * hiện kết quả) → ④ gửi mã lên Worker để đổi + thu hồi, hiện kết quả THẬT cho người dùng
 * theo `AD-6` (`showOutcome()`) → (bước ⑤ xoá dữ liệu nằm NGOÀI hàm này, ở
 * `deleteAccount()`, vô điều kiện — AD-5).
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
      // Bỏ qua bước xác thực lại → không có mã để gửi → chắc chắn chưa thu hồi được.
      showOutcome(false);
      return;
    }

    const fresh = await getFreshAppleRevocationCode();
    if (fresh.kind === 'cancelled' || fresh.kind === 'no-code' || fresh.kind === 'error') {
      // Huỷ hộp thoại, Apple không trả mã, hay signInAsync() lỗi không phải huỷ — cả ba
      // đều là "không có mã để gửi", nên đều là "chưa thu hồi được" với người dùng
      // (brief Task 281: "kết cục với người dùng là như nhau").
      showOutcome(false);
      return;
    }

    const { revoked } = await requestAppleRevoke(fresh.code);
    showOutcome(revoked);
  } catch {
    // Nuốt lỗi có chủ đích — xem ghi chú trên. Luồng đo AD-12 không được chặn việc xoá.
  }
}

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy, gồm cả
 * bài đã lưu đọc offline (Task 267) chứ không chỉ dữ liệu tài khoản.
 *
 * Khác signOutCurrentSession(): với Google còn thu hồi quyền truy cập (revokeAccess)
 * chứ không chỉ ngắt phiên; với Apple, từ Task 281, còn chạy `runAppleRevocationFlow()`
 * gửi mã MỚI lên Worker để Worker đổi mã lấy `refresh_token` rồi thu hồi thật, và hiện
 * kết quả thật cho người dùng (`AD-6`). Cả hai nhánh provider đều best-effort — lỗi thu
 * hồi phía nào cũng KHÔNG được chặn phần xoá dữ liệu tại chỗ (`clearAllLocalUserData` +
 * `signOut` luôn chạy tiếp, nằm ngoài mọi try/catch ở trên).
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
