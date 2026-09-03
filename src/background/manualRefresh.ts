import { runNewsRefreshCycle, type NewsRefreshCycleResult } from './newsRefreshCycle';

/**
 * Nút "Làm mới" thủ công ở màn danh sách (Task 307, BLI 299 — `F5`). GỌI LẠI đúng chu trình
 * đã có (`newsRefreshCycle.runNewsRefreshCycle`, cũng là chu trình mà `appLifecycle.ts` gọi
 * ở lượt tiền cảnh và `backgroundTask.ts` gọi ở lượt nền) — KHÔNG dựng chu trình thứ hai
 * (`AD-18`). File này KHÔNG sửa `newsRefreshCycle.ts` (rào an toàn #5), chỉ import và gọi.
 *
 * Toàn bộ thân hàm chỉ là một lời gọi pass-through CÓ CHỦ ĐÍCH — để `NewsListScreen.tsx`
 * (JSX) có đúng MỘT điểm import cho nút làm mới, và để phép thử chứng minh được "không có
 * chu trình thứ hai nào bị tạo ra" bằng cách mock `newsRefreshCycle` và đếm số lần gọi.
 */
export function triggerManualRefresh(): Promise<NewsRefreshCycleResult> {
  return runNewsRefreshCycle();
}
