import type { AccountState, SignedInAccount } from './accountStore';

/**
 * Chính sách truy cập theo tài khoản (Task 298, BLI 258) — Apple từ chối app (Guideline
 * 5.1.1(v), 01/09) vì màn đăng nhập chặn NGAY LẦN ĐẦU mở app, trước khi đọc được bất cứ
 * tin gì. Nguyên văn: "The app requires users to register or log in to access features
 * that are not account based... Apps may not require users to enter personal information
 * to function, except when directly relevant to the core functionality."
 *
 * Hai hàm dưới đây là NƠI DUY NHẤT quyết định "ai được làm gì" theo trạng thái tài khoản.
 * Tách khỏi `App.tsx`/`ArticleScreen.tsx`/`HomeScreen.tsx` (là JSX, máy KB không dựng được
 * — không có Xcode/simulator, repo chưa từng có react-test-renderer, quyết định có chủ đích
 * từ Task 274) để phép thử đo được BẰNG kiểm thử thật, không chỉ bằng lời hứa trong comment.
 */

/** Màn gốc App.tsx chọn: 'loading' CHỈ trong lúc accountStore đang tự hydrate từ
 *  SecureStore lúc khởi động; mọi trạng thái còn lại — kể cả CHƯA TỪNG đăng nhập, kể cả
 *  VỪA đăng xuất — đều là 'home'. Trước bản vá này, `status === 'signed-out'` render
 *  `LoginScreen` chặn toàn màn: đúng lỗi Apple từ chối. */
export type RootView = 'loading' | 'home';

export function resolveRootView(account: AccountState): RootView {
  return account.status === 'unknown' ? 'loading' : 'home';
}

/**
 * F2 (Task 298): lưu bài đọc offline LÀ tính năng gắn tài khoản (Task 284 tách kho theo
 * `(provider, providerUserId)`) — điều khoản Apple cho phép đòi đăng nhập cho đúng loại
 * này. Dùng CHUNG một hàm cho cả "được lưu bài" (ArticleScreen) lẫn "mục Tài khoản hiện gì"
 * (HomeScreen): guest thấy nút đăng nhập, member thấy đăng xuất/xoá tài khoản — hai chỗ
 * hỏi cùng một câu "đã đăng nhập chưa", không cần hai hàm riêng.
 */
export function isSignedIn(account: AccountState): account is SignedInAccount {
  return account.status === 'signed-in';
}
