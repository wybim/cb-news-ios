import { accountStore } from '../state/accountStore';
import { signOutGoogleSession } from './googleAuth';

/** Đăng xuất — chỉ xoá phiên. Khác "xoá tài khoản": không thu hồi quyền, không xoá gì thêm. */
export async function signOutCurrentSession(): Promise<void> {
  const current = accountStore.getState();
  if (current.status === 'signed-in' && current.provider === 'google') {
    await signOutGoogleSession();
  }
  // Apple: không có phiên native nào khác để ngắt ngoài bản ghi cục bộ của app.
  await accountStore.signOut();
}
