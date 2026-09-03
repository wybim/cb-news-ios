/**
 * Task 318 (BLI 299) — phần THUẦN của dấu hiệu chờ CI (`ciReadySignal.ts`): ghép số bài
 * đang hiện trên màn + một mốc thời gian thành nội dung tệp `ci-home-ready.txt`. Tách riêng
 * khỏi `ciReadySignal.ts` vì file đó import `expo-file-system` (module native, không
 * transpile được dưới Jest môi trường `node` — `node -e "require('expo-file-system')"` ném
 * `SyntaxError: Unexpected token 'export'`, xác nhận ngày 03/09/2026) — hàm ở đây không đụng
 * `File`/`Paths` nên test thẳng được, không cần mock.
 *
 * Định dạng `<postCount>:<now>` đọc được từ shell CI không cần công cụ ngoài:
 * `${CUR%%:*}` cắt lấy số bài (xem `capture-ipad-screenshot.yml`).
 */
export function formatHomeReadyMarker(postCount: number, now: number = Date.now()): string {
  return `${postCount}:${now}`;
}
