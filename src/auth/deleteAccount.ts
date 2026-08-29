import * as SecureStore from 'expo-secure-store';
import { accountStore } from '../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../data/localUserData';
import { revokeGoogleAccess } from './googleAuth';

/**
 * Xoá tài khoản (Apple Guideline 5.1.1(v)) — xoá sạch dữ liệu người dùng trên máy.
 * App không có máy chủ riêng nên "tài khoản" chỉ tồn tại trên máy; xoá xong là hết,
 * không có gì phía server để dọn thêm.
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
  for (const key of LOCAL_USER_DATA_KEYS) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // tiếp tục xoá các khoá còn lại dù một khoá lỗi
    }
  }
  await accountStore.signOut();
}
