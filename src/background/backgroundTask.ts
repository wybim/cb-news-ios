import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { runNewsRefreshCycle } from './newsRefreshCycle';

/**
 * ĐÚNG MỘT lượt chạy nền, ĐÚNG MỘT task identifier (Task 305, BLI 299 — `AD-18`) — không
 * được thêm bất cứ `TaskManager.defineTask`/`BackgroundFetch.registerTaskAsync` nào khác
 * trong app này.
 *
 * `TaskManager.defineTask` PHẢI đứng ở PHẠM VI MODULE (top-level), KHÔNG trong component
 * hay hàm nào — tài liệu Expo SDK 57 (docs.expo.dev/versions/v57.0.0/sdk/task-manager,
 * đã tra cứu trước khi viết file này, đúng luật `AGENTS.md`) nói rõ: hệ điều hành có thể
 * khởi JS bundle ở chế độ nền mà KHÔNG mount view nào, nên task phải được định nghĩa NGAY
 * khi bundle được nạp. Vì vậy `index.ts` import module này VÔ ĐIỀU KIỆN trước
 * `registerRootComponent`, để `defineTask` luôn chạy dù app mở ở tiền cảnh hay bị hệ điều
 * hành đánh thức ở chế độ nền.
 *
 * Task 306 (BLI 299, AD-18): Task 305 dùng `expo-background-task`, tự khai chế độ nền
 * `processing` (`BGTaskScheduler`, xử lý nền dài hạn) — đúng phương án bản ghi kiến trúc
 * `AD-18` đã LOẠI ("dùng cơ chế xử lý nền dài hạn thay vì làm-mới-nền → sai loại tác
 * vụ"). Đổi sang `expo-background-fetch` (chế độ `fetch`/`BGAppRefreshTask`, đúng việc
 * làm-mới-nội-dung-định-kỳ) — thư viện này deprecated ở SDK 57 nhưng CHƯA bị bỏ
 * (docs.expo.dev/versions/v57.0.0/sdk/background-fetch/, đã tra trước khi sửa file này).
 * Chỉ đổi đường đăng ký; `runNewsRefreshCycle()` (handler bốn việc) không đổi gì.
 */
export const NEWS_BACKGROUND_TASK_IDENTIFIER = 'cbnews-news-refresh-cycle';

TaskManager.defineTask(NEWS_BACKGROUND_TASK_IDENTIFIER, async () => {
  try {
    await runNewsRefreshCycle();
    // `expo-background-fetch` không có giá trị "Success" chung — nó phân biệt NewData/
    // NoData/Failed cho hệ điều hành quyết định lịch cấp lượt kế tiếp. Giữ nguyên ánh xạ
    // hai nhánh của Task 305 (không throw → coi là đã xử lý xong; throw → Failed), không
    // đọc `result.ok` để không đụng ngữ nghĩa của `newsRefreshCycle.ts` — handler đó đã
    // tự nuốt lỗi nội bộ (fetch lỗi, offline cache lỗi...) và luôn resolve, nên nhánh
    // throw ở đây chỉ còn là lớp phòng thủ cho lỗi KHÔNG lường trước.
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Đăng ký task với hệ điều hành — gọi một lần lúc app mở (`App.tsx`). Không tự lặp lại
 * đăng ký nếu đã đăng ký rồi. Best-effort: môi trường không hỗ trợ (simulator cũ, Expo Go)
 * không được làm app crash — đây chỉ là việc "động cơ", không phải luồng người dùng thấy.
 */
export async function registerNewsBackgroundTaskAsync(): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(NEWS_BACKGROUND_TASK_IDENTIFIER);
    if (!already) {
      await BackgroundFetch.registerTaskAsync(NEWS_BACKGROUND_TASK_IDENTIFIER);
    }
  } catch {
    // best-effort — xem ghi chú trên.
  }
}
