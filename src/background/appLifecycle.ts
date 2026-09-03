/**
 * Đường TIỀN CẢNH bắt buộc của `AD-25` (Task 305, BLI 299): nếu bộ lên lịch thông báo CHỈ
 * được gọi từ lượt chạy nền thì nó gần như chắc chắn không hiện ra trong một phiên duyệt —
 * iOS cấp lượt nền theo ý nó (`kb/lessons/2026-08-29-tieu-chi-nghiem-thu-dua-tren-hanh-vi-
 * chua-do.md`). `App.tsx` phải gọi `runNewsRefreshCycle()` (từ `newsRefreshCycle.ts`) mỗi
 * khi app quay lại tiền cảnh, KHÔNG chỉ lúc mở app.
 *
 * Hàm THUẦN dưới đây tách khỏi `AppState` của `react-native` để test được mà KHÔNG cần
 * dựng môi trường React Native trong Jest (`testEnvironment: 'node'`, xem `jest.config.js`
 * — đúng tiền lệ `accessPolicy.ts`, Task 274: máy KB không có Xcode/react-test-renderer để
 * kiểm JSX thật). `App.tsx` chỉ nối dây:
 *   `AppState.addEventListener('change', createForegroundRefreshHandler(runNewsRefreshCycle))`.
 */

/** Tập con các giá trị `AppStateStatus` của react-native mà handler này cần phân biệt. */
export type MinimalAppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export function createForegroundRefreshHandler(
  runCycle: () => Promise<unknown>,
): (nextState: MinimalAppStateStatus) => void {
  return (nextState) => {
    if (nextState === 'active') {
      // `.catch()` bắt buộc: `runCycle` không được throw ra ngoài best-effort của nó, nhưng
      // phòng cả trường hợp bất thường — một promise reject không ai bắt ở đây sẽ thành
      // "unhandled rejection", có thể làm crash tiến trình JS (đã đo được bằng chính bài
      // kiểm `appLifecycle.test.ts`: Node thoát tiến trình ngay khi thiếu dòng này).
      runCycle().catch(() => {});
    }
  };
}
