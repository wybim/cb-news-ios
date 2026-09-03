import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPostDetail, type PostDetail } from '../api/newsApi';
import { DEVICE_PARTITION, buildPartitionStorageKey } from './localPartitions';

/**
 * CACHE nội dung bài đọc offline (Task 305, BLI 299 — việc ④ của handler bốn việc,
 * `AD-18`) — bản sao NỘI DUNG CÔNG CỘNG (ai cũng đọc được trên cbcentres.com), KHÔNG tiết
 * lộ gì về người dùng → `sweepOnAccountDeletion: false` (`AD-23`, đăng ký ở
 * `localUserData.ts`).
 *
 * MỘT blob JSON duy nhất (khoá id -> `PostDetail`), không phải một khoá lưu trữ/bài — để
 * mỗi bài tải xong được ghi NGAY bằng một `AsyncStorage.setItem()` nguyên tử: bị cắt giữa
 * chừng (hệ điều hành thu hồi lượt nền) thì bài đang tải dở đơn giản KHÔNG xuất hiện trong
 * blob — không có bản ghi nửa vời — còn các bài đã cache trước đó trong CÙNG blob vẫn
 * nguyên vẹn. Lượt sau chỉ cần so `getCachedArticleIds()` để biết còn thiếu bài nào và tải
 * tiếp — idempotent, resumable (`AD-18` việc ④, DoD Task 305 mục 3).
 */

export const ARTICLE_CACHE_STORAGE_KEY = buildPartitionStorageKey('cbnews.articleCache.v1', DEVICE_PARTITION);

type ArticleCacheState = Record<number, PostDetail>;

async function readCache(): Promise<ArticleCacheState> {
  try {
    const raw = await AsyncStorage.getItem(ARTICLE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ArticleCacheState) : {};
  } catch {
    return {};
  }
}

/** Đọc nội dung đã cache của MỘT bài — dùng cho màn đọc bài offline (task sau). */
export async function getCachedArticle(articleId: number): Promise<PostDetail | null> {
  const cache = await readCache();
  return cache[articleId] ?? null;
}

/** Danh sách mã bài đã cache — dùng để biết còn bài nào CHƯA tải (resume). */
export async function getCachedArticleIds(): Promise<number[]> {
  const cache = await readCache();
  return Object.keys(cache).map(Number);
}

async function putCachedArticle(article: PostDetail): Promise<void> {
  const cache = await readCache();
  const next: ArticleCacheState = { ...cache, [article.id]: article };
  await AsyncStorage.setItem(ARTICLE_CACHE_STORAGE_KEY, JSON.stringify(next));
}

export type OfflineCacheOutcome = { attempted: number; cached: number; failed: number };

/**
 * Tải nội dung đầy đủ cho những bài trong `summaries` CHƯA có trong cache, ghi NGAY từng
 * bài một (không gom hết rồi ghi một lần) — xem lý do ở đầu file. Best-effort: một bài lỗi
 * (mạng, JSON) không chặn các bài còn lại — vòng lặp luôn tiếp tục hết danh sách nhận
 * được, đúng tinh thần "bị cắt giữa chừng vẫn an toàn" của việc ④ (`AD-18`).
 */
export async function cacheArticlesForOfflineReading(
  summaries: readonly { id: number }[],
): Promise<OfflineCacheOutcome> {
  const existingIds = new Set(await getCachedArticleIds());
  const pending = summaries.filter((s) => !existingIds.has(s.id));
  const outcome: OfflineCacheOutcome = { attempted: pending.length, cached: 0, failed: 0 };
  for (const { id } of pending) {
    try {
      const detail = await fetchPostDetail(id);
      await putCachedArticle(detail);
      outcome.cached += 1;
    } catch {
      outcome.failed += 1;
    }
  }
  return outcome;
}
