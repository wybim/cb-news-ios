import { accountStore } from '../state/accountStore';
import { clearAllLocalUserData } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';
import { getAppleAuthorizationCode } from './appleAuth';

/**
 * Worker Cloudflare thu hồi token Apple (Task 265, đợt 3c-b của BLI 258) — sống tại
 * đây, KHÔNG sửa mã nguồn của nó ở task này (chỉ đọc để khớp giao diện). Trường body
 * JSON đúng như Worker `src/cb-news-api-worker/src/index.js` (hàm `xuLyRevoke`) chờ:
 * `token` (string, bắt buộc) — KHÔNG phải `authorizationCode` hay `code`.
 */
const APPLE_REVOKE_WORKER_URL = 'https://cb-news-api-worker.ngminhtri90.workers.dev/revoke';

/**
 * Thu hồi token Apple qua Worker lúc xoá tài khoản (Task 274, BLI 258 — Apple Guideline
 * 5.1.1(v) + technote TN3194 bắt buộc). QUY TẮC QUAN TRỌNG NHẤT: hàm này KHÔNG BAO GIỜ
 * được throw ra ngoài — dù Worker sập, mạng lỗi, hay Apple từ chối, `deleteAccount()`
 * vẫn phải xoá sạch dữ liệu tại chỗ và cho người dùng thoát (TN3194: không thu hồi được
 * thì vẫn phải hoàn tất xoá, tự hướng dẫn người dùng thu hồi quyền sau). Có
 * AbortController giới hạn 8s để một Worker treo (không trả lỗi, không trả gì) cũng
 * không kéo dài trải nghiệm xoá của người dùng.
 *
 * Cố ý KHÔNG đọc/diễn giải response: Worker trả `{"revoked":true}` cho gần như mọi đầu
 * vào có `token` hợp lệ về mặt hình thức (xem kb/lessons/2026-08-29-tieu-chi-nghiem-thu-
 * dua-tren-hanh-vi-chua-do.md) — 200 không chứng minh Apple đã thu hồi thật, nên app
 * không dựa vào đó để quyết định gì, chỉ cố gắng gọi theo kiểu best-effort.
 */
async function revokeAppleToken(): Promise<void> {
  try {
    const code = await getAppleAuthorizationCode();
    if (!code) return; // không có gì để thu hồi (vd tài khoản đăng nhập trước bản vá này)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(APPLE_REVOKE_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // nuốt lỗi có chủ đích (mạng, timeout, Worker sập, địa chỉ sai...) — xem ghi chú trên
  }
}

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy, gồm cả
 * bài đã lưu đọc offline (Task 267) chứ không chỉ dữ liệu tài khoản.
 *
 * Khác signOutCurrentSession(): với Google còn thu hồi quyền truy cập (revokeAccess)
 * chứ không chỉ ngắt phiên; với Apple, từ Task 274, còn gọi Worker thu hồi token phía
 * server. Cả hai nhánh provider đều best-effort — lỗi thu hồi phía nào cũng KHÔNG được
 * chặn phần xoá dữ liệu tại chỗ (`clearAllLocalUserData` + `signOut` luôn chạy tiếp).
 */
export async function deleteAccount(): Promise<void> {
  const current = accountStore.getState();
  if (current.status === 'signed-in' && current.provider === 'google') {
    await revokeGoogleAccess();
  }
  if (current.status === 'signed-in' && current.provider === 'apple') {
    await revokeAppleToken();
  }
  // Xoá TẤT CẢ khoá đã đăng ký ở LOCAL_USER_DATA_KEYS (mọi backend) — nguồn duy nhất,
  // không tự lặp SecureStore ở đây để tránh quên khoá mới (đúng bẫy brief Task 267 cảnh báo).
  await clearAllLocalUserData();
  await accountStore.signOut();
}
