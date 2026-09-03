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

/**
 * Task 312 vòng 2 (BLI 299) — ảnh chụp thật CÓ nội dung (`ipad-13-inch-home-run2.png`, work
 * item 312) lộ MỘT gốc chung cho hai triệu chứng tưởng như rời nhau: 35,5% màn dưới trắng
 * trơn, VÀ một vòng xoay tải trang tiếp ở chân danh sách. Số bài tải lần đầu (10 —
 * `DEFAULT_HOME_POST_COUNT`) đủ lấp màn iPhone (1 cột), nhưng xếp 2 cột trên iPad chỉ ra 5
 * hàng — không lấp nổi khung cao ~1376pt, nên `FlatList` coi như đã cuộn hết và phát
 * `onEndReached` ngay khi vừa vẽ xong.
 *
 * Đây PHẢI là hành vi thật cho người dùng iPad — không phải một nhánh riêng cho CI: tải
 * nhiều bài hơn ngay từ đầu trên màn rộng hơn là điều nên làm cho MỌI người dùng iPad, không
 * chỉ lúc chụp ảnh. Dùng `viewportHeight` thật từ `useWindowDimensions().height` (nơi gọi đã
 * có sẵn), không phải một cờ CI.
 *
 * `[GIẢ ĐỊNH]` — `HOME_HEADER_CHROME_HEIGHT_PT`/`HOME_ROW_HEIGHT_ESTIMATE_PT` suy ngược từ
 * chính khoảng cách đo được trên ảnh `ipad-13-inch-home-run2.png` (quy đổi điểm ảnh @2x của
 * iPad Pro 13" M4 sang point), KHÔNG đo trực tiếp bằng `onLayout` trên simulator thật (máy KB
 * không có Xcode). Sai số có thể có nhưng hướng lệch không nguy hiểm: công thức CHỦ ĐỘNG dư
 * ra `HOME_OVERFLOW_ROWS` hàng và làm tròn LÊN, nên lệch nhẹ chỉ khiến tải dư một chút, không
 * bao giờ khiến danh sách vẫn thiếu — đúng hướng an toàn cho lỗi này.
 */
export const DEFAULT_HOME_POST_COUNT = 10;

const HOME_HEADER_CHROME_HEIGHT_PT = 290;
const HOME_ROW_HEIGHT_ESTIMATE_PT = 120;
/** Số hàng dư thêm ngoài số hàng vừa đủ lấp màn — để danh sách THỰC SỰ cuộn được, không chỉ
 *  vừa khít mép dưới (vừa khít vẫn có thể khiến `onEndReached` phát lại khi layout đo lại
 *  lệch vài điểm ảnh trong lúc ảnh còn đang tải). */
const HOME_OVERFLOW_ROWS = 2;
/** Trần trên — rào chắn cho trường hợp `viewportHeight` bất thường (ví dụ cửa sổ Stage
 *  Manager rất cao trên iPad), không phải số đã đo. */
const HOME_INITIAL_POST_COUNT_CAP = 40;

export function resolveHomeInitialPostCount(mode: HomeLayoutMode, viewportHeight: number): number {
  if (mode === 'single') return DEFAULT_HOME_POST_COUNT; // hành vi iPhone giữ nguyên, không đổi
  const columns = homeListColumns(mode);
  const listAreaHeight = Math.max(viewportHeight - HOME_HEADER_CHROME_HEIGHT_PT, 0);
  const rowsToFill = Math.ceil(listAreaHeight / HOME_ROW_HEIGHT_ESTIMATE_PT) + HOME_OVERFLOW_ROWS;
  const computed = rowsToFill * columns;
  return Math.min(Math.max(computed, DEFAULT_HOME_POST_COUNT), HOME_INITIAL_POST_COUNT_CAP);
}
