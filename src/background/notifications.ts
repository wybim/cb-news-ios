import * as Notifications from 'expo-notifications';
import type { PostSummary } from '../api/newsApi';
import { inlineTextOnly } from '../utils/htmlParser';

/**
 * THÔNG BÁO CỤC BỘ (Task 305, BLI 299 — `AD-16`/`AD-25`).
 *
 * RÀO CỨNG NHẤT CỦA TASK 305: file này CHỈ được gọi bốn hàm của `expo-notifications`:
 * `setNotificationHandler`, `getPermissionsAsync`, `requestPermissionsAsync`,
 * `scheduleNotificationAsync`. TUYỆT ĐỐI KHÔNG được gọi `getExpoPushTokenAsync`,
 * `getDevicePushTokenAsync`, hay bất cứ hàm đăng ký thông báo từ xa nào — gọi chúng là
 * SINH MỘT DEVICE TOKEN, phá `AD-16`, làm sai câu đang công khai trên trang chính sách,
 * và sinh khoản chi hạ tầng đầu tiên của workstream (xem comment giao hàng Task 305, có
 * `grep` xác nhận).
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Xin quyền thông báo — CHỈ được gọi LAZY, ngay trước khi thật sự cần gửi một thông báo
 * (từ `scheduleNewArticleNotification`), KHÔNG gọi lúc app khởi động.
 *
 * Đây là cách rẻ nhất task này làm được để bám tinh thần `F5` ("xin quyền ở thời điểm có
 * nghĩa, không ở màn đầu") MÀ KHÔNG phải sửa màn hình nào: lượt làm mới ĐẦU TIÊN của một
 * máy luôn là "bootstrap" (`newsRefreshCycle.ts` — mốc đã-đọc còn trống, không thông báo
 * gì), nên hộp thoại xin quyền chỉ hiện ra ở lượt CÓ BÀI MỚI THẬT, tức trễ hơn lượt mở app
 * đầu tiên. GAP CÒN LẠI (đã khai trong comment giao hàng): `F5` muốn đúng thời điểm "sau
 * khi người dùng đã đọc ít nhất một bài" — điều đó cần một điểm chạm ở `ArticleScreen`,
 * ngoài phạm vi task này (rào "không sửa màn hình nào").
 */
export async function ensureNotificationPermissionsAsync(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Lên lịch MỘT thông báo cục bộ cho "có bài mới" — `trigger: null` (hiện ngay khi hệ
 * thống xử lý lượt gọi này, dù đang ở lượt nền hay lượt tiền cảnh — `AD-25`). Trả `false`
 * nếu chưa có quyền hoặc `scheduleNotificationAsync` lỗi — KHÔNG throw, vì đây là một
 * nhánh trong việc ② của handler bốn việc và không được chặn việc ③/④ phía sau (`AD-18`).
 */
export async function scheduleNewArticleNotification(
  newArticleCount: number,
  latestArticle: Pick<PostSummary, 'titleHtml'>,
): Promise<boolean> {
  try {
    const granted = await ensureNotificationPermissionsAsync();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: newArticleCount > 1 ? `${newArticleCount} bài mới trên CB News` : 'Có bài mới trên CB News',
        body: inlineTextOnly(latestArticle.titleHtml),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
