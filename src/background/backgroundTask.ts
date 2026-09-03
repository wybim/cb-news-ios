import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { runNewsRefreshCycle } from './newsRefreshCycle';

/**
 * ĐÚNG MỘT lượt chạy nền, ĐÚNG MỘT task identifier (Task 305, BLI 299 — `AD-18`) — không
 * được thêm bất cứ `TaskManager.defineTask`/`BackgroundTask.registerTaskAsync` nào khác
 * trong app này.
 *
 * `TaskManager.defineTask` PHẢI đứng ở PHẠM VI MODULE (top-level), KHÔNG trong component
 * hay hàm nào — tài liệu Expo SDK 57 (docs.expo.dev/versions/v57.0.0/sdk/task-manager,
 * đã tra cứu trước khi viết file này, đúng luật `AGENTS.md`) nói rõ: hệ điều hành có thể
 * khởi JS bundle ở chế độ nền mà KHÔNG mount view nào, nên task phải được định nghĩa NGAY
 * khi bundle được nạp. Vì vậy `index.ts` import module này VÔ ĐIỀU KIỆN trước
 * `registerRootComponent`, để `defineTask` luôn chạy dù app mở ở tiền cảnh hay bị hệ điều
 * hành đánh thức ở chế độ nền.
 */
export const NEWS_BACKGROUND_TASK_IDENTIFIER = 'cbnews-news-refresh-cycle';

TaskManager.defineTask(NEWS_BACKGROUND_TASK_IDENTIFIER, async () => {
  try {
    await runNewsRefreshCycle();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
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
      await BackgroundTask.registerTaskAsync(NEWS_BACKGROUND_TASK_IDENTIFIER);
    }
  } catch {
    // best-effort — xem ghi chú trên.
  }
}
