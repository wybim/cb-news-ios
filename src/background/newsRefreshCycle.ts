import { fetchNewsPage, type PostSummary } from '../api/newsApi';
import { getLastKnownArticleMarker, setLastKnownArticleMarker, setLastSyncedAt } from '../data/newsSyncState';
import { cacheArticlesForOfflineReading, type OfflineCacheOutcome } from '../data/articleCache';
import { writeWidgetSnapshot } from '../data/widgetSnapshot';
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
 * So bài `post` với mốc đã-đọc: mới hơn nếu `date` mới hơn; nếu `date` trùng giây (WordPress
 * chỉ ghi tới giây) thì so `id` làm phân định phụ (WordPress cấp id tăng dần theo thời gian
 * đăng). `post.id === marker.id` (đúng bài đã biết) luôn cho kết quả `false` qua nhánh `id`.
 */
function isNewerThanMarker(post: PostSummary, marker: { id: number; date: string }): boolean {
  if (post.date !== marker.date) return post.date > marker.date;
  return post.id > marker.id;
}

/**
 * Việc ② — so mốc đã-đọc lưu cục bộ (`AD-17`), lệch thì lên lịch thông báo (`AD-16`).
 * Lần ĐẦU TIÊN máy này chạy (chưa có mốc) là "bootstrap": chỉ thiết lập mốc, KHÔNG thông
 * báo gì — tránh xin quyền/thông báo ngay lượt mở app đầu tiên (bám tinh thần `F5`).
 */
async function detectNewArticlesAndSchedule(
  posts: readonly PostSummary[],
): Promise<{ newArticlesDetected: boolean; notificationScheduled: boolean }> {
  const newest = posts[0];
  if (!newest) return { newArticlesDetected: false, notificationScheduled: false };

  const marker = await getLastKnownArticleMarker();
  let newArticlesDetected = false;
  let notificationScheduled = false;

  if (marker !== null && isNewerThanMarker(newest, marker)) {
    newArticlesDetected = true;
    const newCount = posts.filter((p) => isNewerThanMarker(p, marker)).length;
    notificationScheduled = await scheduleNewArticleNotification(newCount, newest);
  }

  await setLastKnownArticleMarker({ id: newest.id, date: newest.date });
  return { newArticlesDetected, notificationScheduled };
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
