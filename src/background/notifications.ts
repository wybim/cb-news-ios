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
 * XIN quyền thông báo (kiểm rồi xin nếu chưa có, bật hộp thoại hệ thống khi cần). Đường
 * gọi hợp lệ DUY NHẤT còn lại là `src/state/notificationTiming.ts`
 * (`maybeRequestNotificationPermissionAfterReading` — chỉ xin SAU khi người dùng đã đọc ít
 * nhất một bài). `scheduleNewArticleNotification` bên dưới KHÔNG còn gọi hàm này (Task 308,
 * đóng lỗ `AD-25`: đường lên lịch chỉ được KIỂM, không được XIN — xem
 * `hasNotificationPermissionAsync`).
 */
export async function ensureNotificationPermissionsAsync(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * KIỂM quyền thông báo hiện có — CHỈ `getPermissionsAsync`, KHÔNG BAO GIỜ gọi
 * `requestPermissionsAsync`, không bật hộp thoại hệ thống. Dùng cho đường LÊN LỊCH
 * (`scheduleNewArticleNotification`), vì đường đó có thể chạy ở lượt nền lẫn lượt tiền cảnh
 * đầu tiên khi mở app (`AD-25`) — xin quyền ở đó là đúng phương án đã bị `AD-25` loại
 * (Task 308).
 */
export async function hasNotificationPermissionAsync(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

/**
 * Lên lịch MỘT thông báo cục bộ cho "có bài chưa đọc" — `trigger: null` (hiện ngay khi hệ
 * thống xử lý lượt gọi này, dù đang ở lượt nền hay lượt tiền cảnh — `AD-25`). Trả `false`
 * nếu chưa có quyền hoặc `scheduleNotificationAsync` lỗi — KHÔNG throw, vì đây là một
 * nhánh trong việc ② của handler bốn việc và không được chặn việc ③/④ phía sau (`AD-18`).
 * CHỈ kiểm quyền (`hasNotificationPermissionAsync`), KHÔNG xin — chưa có quyền thì bỏ qua
 * việc lên lịch trong im lặng, không bật hộp thoại nào (Task 308).
 *
 * Tiêu đề nói về bài CHƯA ĐỌC, không nói "N bài mới" (Task 314, BLI 299, `DoD 4`):
 * `unreadCount` do `newsRefreshCycle.ts` đếm bằng `readingProgress`, không phải bằng so
 * mốc ngày/id — nên có thể đúng cả khi bài đã có sẵn từ trước, không phải mới đăng. Nói
 * "N bài mới" trong trường hợp đó là sai sự thật, điều `AD-25` loại thẳng.
 */
export async function scheduleNewArticleNotification(
  unreadCount: number,
  latestArticle: Pick<PostSummary, 'titleHtml'>,
): Promise<boolean> {
  try {
    const granted = await hasNotificationPermissionAsync();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: unreadCount > 1 ? `Có ${unreadCount} bài bạn chưa đọc` : 'Có 1 bài bạn chưa đọc',
        body: inlineTextOnly(latestArticle.titleHtml),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
