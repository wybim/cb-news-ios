/**
 * QUYẾT ĐỊNH THUẦN cho cách xếp home theo bề rộng màn hình (Task 311, BLI 299 — khảo sát hỗ
 * trợ iPad thật, xem `tmp/cb-news/ad3-vong2-vuot-4-2-2.md` mục 6.3). Tách khỏi
 * `NewsListScreen.tsx` (JSX, máy KB không dựng được — không Xcode/simulator/
 * react-test-renderer, đúng tiền lệ `homeSections.ts` Task 307) để kiểm được bằng phép thử
 * thật.
 *
 * `AD-21` KHÔNG đổi: home vẫn đúng 4 khối, không thêm màn trung gian, không thêm thư viện
 * điều hướng. Layout hai cột chỉ là cách XẾP cùng nội dung đó cho rộng hơn — không đổi khối
 * nào, không đổi nguồn dữ liệu nào.
 *
 * Ngưỡng 600pt: `app.config.js` khoá `orientation: 'portrait'` cho toàn app (kể cả khi bật
 * iPad sau này), nên chỉ cần phân định ĐÚNG HAI dải bề rộng portrait — iPhone (rộng nhất hiện
 * có: iPhone 16 Pro Max ≈430pt) và iPad (hẹp nhất hiện có: iPad mini ≈744pt). 600pt nằm giữa
 * hai dải đó với biên độ lớn cả hai phía. `[GIẢ ĐỊNH]` — chưa đo trên thiết bị/simulator thật
 * (máy KB không có Xcode/simulator, F4 brief Task 311), chỉ dựa trên bảng kích thước điểm
 * công khai của Apple. Đây là điểm đầu tiên cần xem lại nếu sau này đo được số thật.
 */
export type HomeLayoutMode = 'single' | 'twoColumn';

export const TWO_COLUMN_MIN_WIDTH = 600;

/** `width` tính bằng points (giống `useWindowDimensions().width` của React Native), KHÔNG
 *  phải pixel vật lý. */
export function resolveHomeLayoutMode(width: number): HomeLayoutMode {
  return width >= TWO_COLUMN_MIN_WIDTH ? 'twoColumn' : 'single';
}

/** Số cột cho `FlatList` (khối ③ "Mới nhất" / tab "Đã lưu") ứng với từng cách xếp. */
export function homeListColumns(mode: HomeLayoutMode): 1 | 2 {
  return mode === 'twoColumn' ? 2 : 1;
}

/**
 * Task 312 (BLI 299) — ảnh chụp thật đầu tiên (`ipad-13-inch-home.png`, work item 299) lộ
 * layout thưa: nội dung dùng NGUYÊN khoảng đệm mép 16pt của iPhone trên một khung rộng gấp
 * hơn hai lần. `AD-21` không đổi (vẫn đúng 4 khối, không thêm màn/thư viện điều hướng) —
 * đây chỉ là CÁCH XẾP LẠI cùng nội dung đó, không thêm dữ liệu, không thêm khối nào.
 *
 * `horizontalPadding` là khoảng đệm hai mép cho `homeHeader`/`tabs`/lưới danh sách — lớn
 * hơn ở `twoColumn` để nội dung không dán sát mép trên khung rộng (một trong hai vấn đề
 * F2/brief nêu). Số 32 không đo từ thiết bị thật (máy KB không có Xcode/simulator, F5) —
 * `[GIẢ ĐỊNH]` chọn gấp đôi mép iPhone như một bước vừa phải, không phải hằng số Apple quy
 * định; đổi lại dễ nếu ảnh chụp thật cho thấy cần khác.
 */
export type HomeLayoutMetrics = {
  horizontalPadding: number;
};

export function resolveHomeLayoutMetrics(mode: HomeLayoutMode): HomeLayoutMetrics {
  return { horizontalPadding: mode === 'twoColumn' ? 32 : 16 };
}
