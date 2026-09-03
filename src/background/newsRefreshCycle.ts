import { fetchNewsPage, type PostSummary } from '../api/newsApi';
import { getLastKnownArticleMarker, setLastKnownArticleMarker, setLastSyncedAt } from '../data/newsSyncState';
import { cacheArticlesForOfflineReading, type OfflineCacheOutcome } from '../data/articleCache';
import { writeWidgetSnapshot } from '../data/widgetSnapshot';
import { getAllReadingProgress } from '../data/readingProgress';
import { scheduleNewArticleNotification } from './notifications';

/**
 * ĐỘNG CƠ của vòng 2 (Task 305, BLI 299 — `AD-18`) — ĐÚNG MỘT handler, bốn việc, thứ tự
 * rẻ-trước-đắt-sau (`F2` của brief Task 305, mục 4 `ad3-vong2-vuot-4-2-2.md`):
 *   ① lấy danh sách bài mới (nhẹ) → ② so mốc đã-đọc, lệch thì lên lịch thông báo cục bộ
 *   → ③ ghi ảnh chụp cho widget → [ghi mốc đồng-bộ] → ④ tải nội dung cho đọc offline
 *   (best-effort, chịu được bị cắt).
 *
 * Hàm `runNewsRefreshCycle()` này được dùng CHUNG bởi CẢ lượt chạy nền (`backgroundTask.ts`)
 * LẪN lượt làm mới tiền cảnh (`appLifecycle.ts`, nối dây ở `App.tsx`) — đây chính là cơ chế
 * khiến `AD-25` đúng: gọi hàm NÀY từ hai nơi thì bộ lên lịch thông báo (việc ②, nằm bên
 * trong) tự động chạy ở CẢ hai đường, không cần viết hai lần, và không phụ thuộc riêng vào
 * việc iOS có cấp lượt nền hay không (`kb/lessons/2026-08-29-tieu-chi-nghiem-thu-dua-tren-
 * hanh-vi-chua-do.md`).
 *
 * Mốc đồng-bộ (`newsSyncState.setLastSyncedAt`) được ghi NGAY SAU việc ③, KHÔNG sau việc
 * ④ — để mốc phản ánh "lượt nền/tiền cảnh đã chạy" chứ không "đã tải xong hết bài" (`AD-18`,
 * DoD Task 305 mục 4). Việc ④ có thể lỗi/không hoàn tất mà KHÔNG ảnh hưởng tới mốc này.
 *
 * Khoá đơn-luồng (`inFlight`): lượt nền và lượt tiền cảnh có thể được hệ thống gọi gần như
 * đồng thời (vd app vừa mở vừa có một lượt nền đến hạn) — nếu đã có một lượt đang chạy,
 * lượt gọi thêm CHIA SẺ promise đang chạy thay vì khởi một lượt song song (tránh hai lượt
 * cùng ghi đè `newsSyncState`/`articleCache` — vẫn đúng "MỘT lượt chạy nền" của `AD-18`).
 *
 * Task 314 (BLI 299, `DoD 4`): mốc `lastKnownArticleMarker` (việc ②) chỉ TIẾN khi một
 * thông báo đã THẬT SỰ được lên lịch (`scheduleNewArticleNotification` trả `true`) — xem
 * `detectNewArticlesAndSchedule` bên dưới. Trước Task 314, mốc luôn tiến ngay ở lượt tải
 * đầu tiên bất kể có thông báo hay không, khiến thông báo không thể chứng minh được trong
 * một phiên duyệt trên máy mới cài (lượt đầu tiêu thụ hết "cái mới" trước khi người dùng
 * kịp cấp quyền).
 */

export const NEWS_LIST_PAGE_SIZE = 10;

export type NewsRefreshCycleResult = {
  /** `false` nếu việc ① (fetch danh sách) đã lỗi — cả handler dừng sớm, không làm gì thêm. */
  ok: boolean;
  newArticlesDetected: boolean;
  notificationScheduled: boolean;
  widgetSnapshotWritten: boolean;
  offlineCache: OfflineCacheOutcome;
};

const EMPTY_RESULT: NewsRefreshCycleResult = {
  ok: false,
  newArticlesDetected: false,
  notificationScheduled: false,
  widgetSnapshotWritten: false,
  offlineCache: { attempted: 0, cached: 0, failed: 0 },
};

/**
 * Đếm bài trong `posts` (danh sách VỪA TẢI, `NEWS_LIST_PAGE_SIZE` bài) mà người dùng CHƯA
 * mở đọc — không có bản ghi trong `readingProgress` (Task 314, BLI 299, `DoD 4`). Dùng làm
 * số N trong nội dung thông báo VÀ là vế-1 của điều kiện lên lịch bên dưới. KHÔNG so
 * `date`/`id` với mốc — đúng ngay cả khi bài đã có sẵn từ trước (không mới đăng) nhưng
 * người dùng chưa đọc, nên không được nói "N bài mới" khi con số này là bài chưa đọc
 * (`AD-25` loại thông báo nói không đúng sự thật).
 */
async function countUnreadPosts(posts: readonly PostSummary[]): Promise<number> {
  const progress = await getAllReadingProgress();
  const readIds = new Set(progress.map((entry) => entry.articleId));
  return posts.reduce((count, post) => (readIds.has(post.id) ? count : count + 1), 0);
}

/**
 * Việc ② — điều kiện lên lịch thông báo (Task 314, BLI 299, `DoD 4`), CẢ HAI vế phải đúng:
 *   (1) có ít nhất một bài trong `posts` mà người dùng CHƯA đọc (`countUnreadPosts` > 0);
 *   (2) bài mới nhất vừa tải KHÁC bài ghi trong mốc (`newest.id !== marker.id`), hoặc mốc
 *       còn `null`.
 *
 * `lastKnownArticleMarker` giờ mang nghĩa "bài mới nhất máy ĐÃ THẬT SỰ thông báo về" (xem
 * comment đầu `newsSyncState.ts`) — nên mốc CHỈ TIẾN khi `scheduleNewArticleNotification`
 * trả về `true` (thông báo đã thật sự được lên lịch). Chưa lên lịch được (chưa có quyền,
 * hoặc lỗi runtime) thì để NGUYÊN mốc — kể cả ở lần chạy đầu tiên (marker vẫn `null`), khác
 * với hành vi "bootstrap chỉ thiết lập mốc" trước Task 314: nay mốc `null` không còn tự
 * tiến nếu chưa có thông báo nào thật sự phát ra, vì đó chính là lỗ khiến `DoD 4` không đạt
 * trên máy mới cài (thông báo không thể chứng minh được trong một phiên duyệt).
 */
async function detectNewArticlesAndSchedule(
  posts: readonly PostSummary[],
): Promise<{ newArticlesDetected: boolean; notificationScheduled: boolean }> {
  const newest = posts[0];
  if (!newest) return { newArticlesDetected: false, notificationScheduled: false };

  const marker = await getLastKnownArticleMarker();
  const markerBehindNewest = marker === null || newest.id !== marker.id;
  if (!markerBehindNewest) {
    return { newArticlesDetected: false, notificationScheduled: false };
  }

  const unreadCount = await countUnreadPosts(posts);
  if (unreadCount === 0) {
    return { newArticlesDetected: false, notificationScheduled: false };
  }

  const notificationScheduled = await scheduleNewArticleNotification(unreadCount, newest);
  if (notificationScheduled) {
    await setLastKnownArticleMarker({ id: newest.id, date: newest.date });
  }
  return { newArticlesDetected: true, notificationScheduled };
}

let inFlight: Promise<NewsRefreshCycleResult> | null = null;

export function runNewsRefreshCycle(): Promise<NewsRefreshCycleResult> {
  if (!inFlight) {
    // `.catch()` NGOÀI CÙNG bắt buộc: cả hai nơi gọi hàm này (`backgroundTask.ts` gọi có
    // try/catch riêng, nhưng `App.tsx`/`appLifecycle.ts` gọi kiểu `void runNewsRefreshCycle()`
    // — một promise reject không ai bắt ở đó là "unhandled rejection", có thể crash tiến
    // trình JS (đã đo được bằng chính bài kiểm `appLifecycle.test.ts` khi thiếu lớp bắt lỗi
    // tương ứng ở đó). Mọi lỗi KHÔNG lường trước ở việc ①-④ (ngoài các try/catch cục bộ đã
    // có) rơi vào đây, trả về kết quả rỗng thay vì làm promise của lượt gọi bị reject.
    inFlight = executeNewsRefreshCycle()
      .catch(() => EMPTY_RESULT)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

async function executeNewsRefreshCycle(): Promise<NewsRefreshCycleResult> {
  // ① — nhẹ: một trang, số trường tối thiểu (F2). Lỗi ở đây thì không có gì để so/ghi/tải
  // tiếp — dừng sớm, KHÔNG throw (handler nền/tiền cảnh không được crash vì mất mạng).
  let page: Awaited<ReturnType<typeof fetchNewsPage>>;
  try {
    page = await fetchNewsPage(1, NEWS_LIST_PAGE_SIZE);
  } catch {
    return EMPTY_RESULT;
  }

  // ② — so mốc đã-đọc, lệch thì lên lịch thông báo cục bộ (cả hai đường AD-25).
  const { newArticlesDetected, notificationScheduled } = await detectNewArticlesAndSchedule(page.posts);

  // ③ — ảnh chụp cho widget, đường nối mỏng xuống phân vùng thiết bị (F3).
  let widgetSnapshotWritten = false;
  try {
    await writeWidgetSnapshot(page.posts);
    widgetSnapshotWritten = true;
  } catch {
    widgetSnapshotWritten = false;
  }

  // Mốc đồng-bộ NGAY SAU ③, KHÔNG sau ④ (AD-18) — xem ghi chú đầu file.
  await setLastSyncedAt(new Date().toISOString());

  // ④ — tải nội dung cho đọc offline, best-effort, idempotent, chịu được bị cắt giữa chừng.
  // `cacheArticlesForOfflineReading` tự bắt lỗi TỪNG bài, nhưng vẫn bọc thêm một lớp
  // try/catch NGOÀI CÙNG ở đây: nếu cả bước ④ hỏng theo cách không lường trước (vd hệ điều
  // hành cắt ngang JS giữa chừng), chu trình vẫn phải RESOLVE bình thường — mốc đồng-bộ đã
  // ghi ở trên không được kéo theo một promise bị reject của cùng lượt gọi.
  let offlineCache: OfflineCacheOutcome = { attempted: 0, cached: 0, failed: 0 };
  try {
    offlineCache = await cacheArticlesForOfflineReading(page.posts);
  } catch {
    // best-effort — xem ghi chú trên.
  }

  return { ok: true, newArticlesDetected, notificationScheduled, widgetSnapshotWritten, offlineCache };
}
