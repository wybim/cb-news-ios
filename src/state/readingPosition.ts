/**
 * TOÁN THUẦN đổi giữa vị trí cuộn (pixel) và tiến độ đọc 0..1 (Task 307, BLI 299 — `AD-21`
 * khối ①: "bấm vào là về đúng chỗ đang đọc, không phải về đầu bài"). `progress` là đơn vị do
 * chính task này định nghĩa (`readingProgress.ts` để ngỏ, xem comment tại đó).
 *
 * Tách khỏi `ArticleScreen.tsx` (JSX, dùng `ScrollView`/`onScroll`/`onContentSizeChange` —
 * máy KB không dựng được để test trực tiếp) để phần TOÁN kiểm được bằng phép thử thật, đúng
 * tinh thần Task 298 (`accessPolicy.ts`): JSX chỉ gọi hai hàm dưới đây, không tự tính.
 */

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * `offsetY` hiện tại của ScrollView → tiến độ 0..1. `scrollable = contentHeight -
 * layoutHeight` là quãng đường có thể cuộn. Bài NGẮN hơn một màn hình (`scrollable <= 0`,
 * chưa đo được layout hoặc nội dung vừa khít) → trả `0`: không có gì để cuộn nên không suy
 * ra được tiến độ có ý nghĩa, KHÔNG suy diễn "đã đọc hết" từ một phép chia không xác định.
 */
export function computeScrollProgress(offsetY: number, contentHeight: number, layoutHeight: number): number {
  const scrollable = contentHeight - layoutHeight;
  if (scrollable <= 0) return 0;
  return clamp01(offsetY / scrollable);
}

/**
 * Chiều ngược lại: tiến độ 0..1 đã lưu → `offsetY` cần cuộn tới khi mở lại bài. Cùng quy ước
 * `scrollable <= 0` → `0` (không có gì để cuộn tới).
 */
export function computeScrollOffsetFromProgress(progress: number, contentHeight: number, layoutHeight: number): number {
  const scrollable = Math.max(0, contentHeight - layoutHeight);
  if (scrollable === 0) return 0;
  return clamp01(progress) * scrollable;
}
