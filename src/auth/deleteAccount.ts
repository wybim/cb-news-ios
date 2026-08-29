import { accountStore } from '../state/accountStore';
import { clearAllLocalUserData } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy, gồm cả
 * bài đã lưu đọc offline (Task 267) chứ không chỉ dữ liệu tài khoản.
 *
 * Khác signOutCurrentSession(): với Google còn thu hồi quyền truy cập (revokeAccess)
 * chứ không chỉ ngắt phiên. Với Apple: KHÔNG có API thu hồi phía client cho native
 * Sign in with Apple, và app không có server để gọi endpoint revoke của Apple — rủi ro
 * này BLI cha (258) đã treo hẹn tra lại ở đợt 5, task này không tự xử lý.
 */
export async function deleteAccount(): Promise<void> {
  const current = accountStore.getState();
  if (current.status === 'signed-in' && current.provider === 'google') {
    await revokeGoogleAccess();
  }
  // Xoá TẤT CẢ khoá đã đăng ký ở LOCAL_USER_DATA_KEYS (mọi backend) — nguồn duy nhất,
  // không tự lặp SecureStore ở đây để tránh quên khoá mới (đúng bẫy brief Task 267 cảnh báo).
  await clearAllLocalUserData();
  await accountStore.signOut();
}
