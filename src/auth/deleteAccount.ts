import { Alert } from 'react-native';
import { accountStore } from '../state/accountStore';
import { clearAllLocalUserData } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';
import { getAppleAuthorizationCode, probeSecondAppleSignIn } from './appleAuth';

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
 * Task 275 (BLI 258, đợt 3e — bản THĂM DÒ, không phải tính năng): đo trụ chịu lực của
 * AD-2 trước khi viết mã Worker thật cho luồng đó — xem `probeSecondAppleSignIn()` ở
 * `appleAuth.ts`. Hiện đúng 1 trong 4 dòng chữ NGUYÊN VĂN lên màn hình bằng
 * `Alert.alert` — không cần máy tính, không cần nhật ký, và KHÔNG hiện giá trị mã dưới
 * bất kỳ hình thức nào khác ngoài độ dài (rào an toàn Task 275).
 *
 * QUY TẮC QUAN TRỌNG NHẤT (rào an toàn #2 của Task 275): bước thăm dò KHÔNG ĐƯỢC chặn
 * việc xoá dữ liệu tại chỗ. `probeSecondAppleSignIn()` tự nó không ném lỗi ra ngoài
 * (try/catch nội bộ phân loại mọi lỗi thành kind 'error'/'cancelled'), nhưng hàm này
 * vẫn bọc thêm một lớp try/catch NGOÀI — phòng cả lỗi bất thường lọt ra từ chính module
 * probe (vd. lỗi trong Alert.alert) — để `deleteAccount()` LUÔN chạy tiếp tới bước xoá
 * dữ liệu dù nhánh thăm dò hỏng kiểu gì. Phép thử ép nhánh này ném lỗi, xem
 * `deleteAccount.probe-failure.test.ts`.
 */
async function runDeleteAccountProbe(): Promise<void> {
  try {
    const result = await probeSecondAppleSignIn();
    switch (result.kind) {
      case 'has-code':
        Alert.alert('Thăm dò', `THAM DO: co ma, dai ${result.length} ky tu`);
        break;
      case 'no-code':
        Alert.alert('Thăm dò', 'THAM DO: KHONG co ma');
        break;
      case 'cancelled':
        Alert.alert('Thăm dò', 'THAM DO: nguoi dung huy');
        break;
      case 'error':
        Alert.alert('Thăm dò', `THAM DO: loi ${result.errorName}`);
        break;
    }
  } catch {
    // Nuốt có chủ đích — xem ghi chú trên. Bước thăm dò không được chặn việc xoá.
  }
}

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy, gồm cả
 * bài đã lưu đọc offline (Task 267) chứ không chỉ dữ liệu tài khoản.
 *
 * Khác signOutCurrentSession(): với Google còn thu hồi quyền truy cập (revokeAccess)
 * chứ không chỉ ngắt phiên; với Apple, từ Task 274, còn gọi Worker thu hồi token phía
 * server, và từ Task 275 còn chạy bước thăm dò (xem `runDeleteAccountProbe()`). Cả hai
 * nhánh provider đều best-effort — lỗi thu hồi phía nào, hay lỗi thăm dò, cũng KHÔNG
 * được chặn phần xoá dữ liệu tại chỗ (`clearAllLocalUserData` + `signOut` luôn chạy tiếp).
 */
export async function deleteAccount(): Promise<void> {
  const current = accountStore.getState();
  if (current.status === 'signed-in' && current.provider === 'google') {
    await revokeGoogleAccess();
  }
  if (current.status === 'signed-in' && current.provider === 'apple') {
    await revokeAppleToken();
    await runDeleteAccountProbe();
  }
  // Xoá TẤT CẢ khoá đã đăng ký ở LOCAL_USER_DATA_KEYS (mọi backend) — nguồn duy nhất,
  // không tự lặp SecureStore ở đây để tránh quên khoá mới (đúng bẫy brief Task 267 cảnh báo).
  await clearAllLocalUserData();
  await accountStore.signOut();
}
