import type { ReadingProgressEntry } from '../data/readingProgress';
import type { PostDetail } from '../api/newsApi';

/**
 * QUYẾT ĐỊNH THUẦN cho home nhiều khối (Task 307, BLI 299 — `AD-21`, xem
 * `tmp/cb-news/ad3-vong2-vuot-4-2-2.md` mục 2 dòng `AD-21`). Tách khỏi `NewsListScreen.tsx`
 * (JSX, máy KB không dựng được — không Xcode/simulator/react-test-renderer, đúng tiền lệ
 * `accessPolicy.ts` Task 298) để kiểm được bằng phép thử thật.
 *
 * KHÔNG hàm nào ở đây nhận tham số tài khoản/đăng nhập — cả ba khối phải chạy đủ nghĩa khi
 * CHƯA đăng nhập (`F3`/`AD-22`), nên đầu vào chỉ có dữ liệu phân vùng THIẾT BỊ.
 */

/** Bản ghi "Đang đọc dở" — chọn bài có `lastReadAt` MỚI NHẤT trong toàn bộ bản ghi trạng
 *  thái đọc. `null` khi chưa từng đọc bài nào trên máy này — khối ① khi đó KHÔNG hiện gì
 *  (rào an toàn: cấm dựng tiêu chí lên hành vi chưa xảy ra). */
export function selectContinueReadingEntry(
  entries: readonly ReadingProgressEntry[],
): ReadingProgressEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((latest, entry) => (entry.lastReadAt > latest.lastReadAt ? entry : latest));
}

export type ContinueReadingSection = {
  kind: 'continueReading';
  entry: ReadingProgressEntry;
  /** Chi tiết bài lấy TỪ CACHE offline đã có sẵn (`articleCache.ts`, không gọi mạng thêm) —
   *  `null` nếu bài không còn trong cache (vd đã bị vòng cache sau ghi đè). JSX khi đó vẫn
   *  hiện được khối này, chỉ không có tiêu đề để hiện. */
  article: PostDetail | null;
};

export type OfflineReadySection = {
  kind: 'offlineReady';
  /** Số bài đã có sẵn trong cache offline (`articleCache.ts`, việc ④ của `newsRefreshCycle.ts`). */
  count: number;
  /** Mốc đồng-bộ lần cuối, ISO 8601, ĐỌC THẲNG từ `newsSyncState.getLastSyncedAt()` — KHÔNG
   *  tự tính lại. `null` nghĩa là máy này CHƯA TỪNG chạy xong một lượt (iOS có thể chưa bao
   *  giờ cấp lượt nền) — khối này vẫn phải hiển thị tử tế ở trạng thái đó (`F2`/DoD mục 3). */
  lastSyncedAt: string | null;
};

export type LatestSection = { kind: 'latest' };

export type HomeSection = ContinueReadingSection | OfflineReadySection | LatestSection;

export type HomeSectionsInput = {
  continueReadingEntry: ReadingProgressEntry | null;
  /** Chỉ có ý nghĩa khi `continueReadingEntry` khác `null`; bỏ qua khi đó là `null`. */
  continueReadingArticle: PostDetail | null;
  offlineCount: number;
  lastSyncedAt: string | null;
};

/**
 * Thứ tự CỐ ĐỊNH theo `AD-21`: ① Đang đọc dở (nếu có) → ② Đã tải sẵn → ③ Mới nhất. Khối ④
 * (ô tìm kiếm) KHÔNG thuộc task này — xem rào an toàn #2 của Task 307.
 */
export function buildHomeSections(input: HomeSectionsInput): HomeSection[] {
  const sections: HomeSection[] = [];
  if (input.continueReadingEntry) {
    sections.push({
      kind: 'continueReading',
      entry: input.continueReadingEntry,
      article: input.continueReadingArticle,
    });
  }
  sections.push({ kind: 'offlineReady', count: input.offlineCount, lastSyncedAt: input.lastSyncedAt });
  sections.push({ kind: 'latest' });
  return sections;
}

/**
 * Định dạng mốc đồng-bộ dạng giờ:phút theo múi giờ CỦA MÁY (giống người dùng đang nhìn
 * đồng hồ máy họ) — `null` khi chưa có mốc nào (F2, DoD mục 3), JSX tự quyết câu chữ hiện ra
 * trong trường hợp đó (không phải việc của hàm thuần này).
 */
export function formatSyncTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
