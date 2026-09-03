import { getAllReadingProgress } from './readingProgress';
import { getCachedArticle, getCachedArticleIds } from './articleCache';
import { getLastSyncedAt } from './newsSyncState';
import { buildHomeSections, selectContinueReadingEntry, type HomeSection, type HomeSectionsInput } from '../state/homeSections';

/**
 * Gom dữ liệu cho home nhiều khối (Task 307, BLI 299 — `AD-21`/`AD-22`) TỪ ĐÚNG BA nguồn
 * phân vùng THIẾT BỊ đã có sẵn — KHÔNG tạo lớp lưu trữ thứ hai (`F1`), KHÔNG tự tính lại mốc
 * đồng-bộ (`F2`, đọc thẳng `newsSyncState.getLastSyncedAt()`).
 *
 * CỐ Ý không import `accountStore`/`isSignedIn` — cả ba khối phải chạy đủ nghĩa khi CHƯA
 * đăng nhập (`F3`/`AD-22`); module này không có khái niệm "ai đang đăng nhập" để mà rẽ
 * nhánh theo nó.
 */
export async function loadHomeSectionsData(): Promise<HomeSectionsInput> {
  const [entries, cachedIds, lastSyncedAt] = await Promise.all([
    getAllReadingProgress(),
    getCachedArticleIds(),
    getLastSyncedAt(),
  ]);

  const continueReadingEntry = selectContinueReadingEntry(entries);
  // Tiêu đề/ảnh của bài "đang đọc dở" lấy TỪ CACHE offline đã có sẵn — không gọi mạng thêm
  // (`articleCache.ts`, cùng phân vùng thiết bị). `null` nếu bài không còn trong cache.
  const continueReadingArticle = continueReadingEntry
    ? await getCachedArticle(continueReadingEntry.articleId)
    : null;

  return {
    continueReadingEntry,
    continueReadingArticle,
    offlineCount: cachedIds.length,
    lastSyncedAt,
  };
}

export async function loadHomeSections(): Promise<HomeSection[]> {
  return buildHomeSections(await loadHomeSectionsData());
}
