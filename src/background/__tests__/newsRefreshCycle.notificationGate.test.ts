/// <reference types="jest" />
/**
 * Task 314 (BLI 299, `DoD 4`) — sáu trường hợp thử ĐÚNG SÁU DÒNG của bảng "chuỗi thao tác
 * PHẢI chạy được sau khi sửa" trong brief Task 314. Bảng đó CHÍNH LÀ `DoD 4` viết thành
 * phép thử (xem comment giao hàng Task 314) — mỗi `it()` của describe đầu tiên map 1:1 với
 * một dòng bảng, ĐÚNG THỨ TỰ khai báo.
 *
 * KHÁC với `newsRefreshCycle.order.test.ts` (mỗi test độc lập, mock reset ở `beforeEach`):
 * sáu `it()` của describe đầu tiên CỐ Ý CHIA SẺ trạng thái (mốc `lastKnownArticleMarker`
 * giả lập bằng biến module `storedMarker` + tập id đã đọc `readArticleIds`) và chạy TUẦN TỰ
 * (Jest chạy các `it()` trong cùng describe theo đúng thứ tự khai báo, không song song) — để
 * tái hiện ĐÚNG MỘT câu chuyện liền mạch của bảng sáu dòng, thay vì sáu tình huống rời rạc.
 * Đổi thứ tự các `it()` bên dưới sẽ LÀM SAI ý nghĩa bài kiểm.
 *
 * Quy mô rút gọn còn 3 bài/lượt tải (bảng minh hoạ trong brief dùng số tròn 19/20 cho "chưa
 * đọc" — số bài chưa đọc CỘNG DỒN của cả app, không phải giới hạn đúng
 * `NEWS_LIST_PAGE_SIZE`). File này giữ ĐÚNG PATTERN tăng/giảm của bảng (đọc 1 bài → chưa-đọc
 * giảm đúng 1; CB đăng bài mới → chưa-đọc tăng đúng 1; kéo làm mới không đổi gì → chưa-đọc
 * đứng yên), chỉ khác quy mô tuyệt đối — vì `countUnreadPosts` (`newsRefreshCycle.ts`) đếm
 * bài chưa đọc TRONG DANH SÁCH VỪA TẢI, đúng định nghĩa vế-1 trong brief Task 314 ("có ít
 * nhất một bài TRONG DANH SÁCH VỪA TẢI mà người dùng chưa mở đọc"), không phải tổng kho bài
 * toàn app. Gap này (số tuyệt đối 2/3 thay vì 19/20) được nêu rõ trong comment giao hàng
 * Task 314 — không lặng lẽ bỏ qua.
 */

// Mọi mock khai báo BARE `jest.fn()` (không truyền implementation ngay) rồi gán
// `.mockImplementation` SAU `import` — nếu truyền implementation ngay lúc khai báo,
// TypeScript suy luận chữ ký 0-tham-số từ implementation đó, làm `(...args: unknown[]) =>
// mockX(...args)` trong factory bên dưới lỗi TS2556 (spread vào hàm 0-tham-số). Bare
// `jest.fn()` giữ chữ ký `(...args: any[]) => any`, đúng khuôn `newsRefreshCycle.order.test.ts`
// đã dùng.
const mockFetchNewsPage = jest.fn();
jest.mock('../../api/newsApi', () => ({
  __esModule: true,
  fetchNewsPage: (...args: unknown[]) => mockFetchNewsPage(...args),
}));

const mockCacheArticlesForOfflineReading = jest.fn();
jest.mock('../../data/articleCache', () => ({
  __esModule: true,
  cacheArticlesForOfflineReading: (...args: unknown[]) => mockCacheArticlesForOfflineReading(...args),
}));

const mockWriteWidgetSnapshot = jest.fn();
jest.mock('../../data/widgetSnapshot', () => ({
  __esModule: true,
  writeWidgetSnapshot: (...args: unknown[]) => mockWriteWidgetSnapshot(...args),
}));

const mockSetLastSyncedAt = jest.fn();
// `getLastKnownArticleMarker`/`setLastKnownArticleMarker` giả lập bằng MỘT biến module
// (`storedMarker`) thay vì mock rời từng `it()` — để mốc THẬT SỰ tiến/không tiến qua các
// `it()` tuần tự, đúng như `AsyncStorage` thật sẽ làm trên một máy (xem đầu file).
let storedMarker: { id: number; date: string } | null = null;
const mockGetLastKnownArticleMarker = jest.fn();
const mockSetLastKnownArticleMarker = jest.fn();
jest.mock('../../data/newsSyncState', () => ({
  __esModule: true,
  getLastKnownArticleMarker: (...args: unknown[]) => mockGetLastKnownArticleMarker(...args),
  setLastKnownArticleMarker: (...args: unknown[]) => mockSetLastKnownArticleMarker(...args),
  setLastSyncedAt: (...args: unknown[]) => mockSetLastSyncedAt(...args),
}));

// `readingProgress` giả lập bằng một Set id đã đọc — mutable giữa các `it()`, đúng tinh
// thần "Đọc một bài" ở Dòng 2 của bảng (KHÔNG gọi `runNewsRefreshCycle`, chỉ đổi trạng thái
// đọc trực tiếp, giống `ArticleScreen.tsx` gọi `setReadingProgress` khi người dùng đọc bài).
const readArticleIds = new Set<number>();
const mockGetAllReadingProgress = jest.fn();
jest.mock('../../data/readingProgress', () => ({
  __esModule: true,
  getAllReadingProgress: (...args: unknown[]) => mockGetAllReadingProgress(...args),
}));

// Cờ quyền thông báo giả lập — Dòng 1 chưa có quyền, Dòng 2 mô phỏng người dùng CẤP quyền
// (đúng brief: `ensureNotificationPermissionsAsync`/`notificationTiming.ts` NGOÀI vùng file
// Task 314, rào an toàn #1 — file này không gọi mã xin quyền thật, chỉ đổi cờ giả lập).
let permissionGranted = false;
const mockScheduleNewArticleNotification = jest.fn();
jest.mock('../notifications', () => ({
  __esModule: true,
  scheduleNewArticleNotification: (...args: unknown[]) => mockScheduleNewArticleNotification(...args),
}));

import { runNewsRefreshCycle } from '../newsRefreshCycle';

mockCacheArticlesForOfflineReading.mockImplementation(async () => ({ attempted: 0, cached: 0, failed: 0 }));
mockWriteWidgetSnapshot.mockImplementation(async () => {});
mockSetLastSyncedAt.mockImplementation(async () => {});
mockGetLastKnownArticleMarker.mockImplementation(async () => storedMarker);
mockSetLastKnownArticleMarker.mockImplementation(async (marker: { id: number; date: string }) => {
  storedMarker = marker;
});
mockGetAllReadingProgress.mockImplementation(async () =>
  Array.from(readArticleIds).map((articleId) => ({
    articleId,
    progress: 1,
    lastReadAt: '2026-09-03T00:00:00.000Z',
  })),
);
mockScheduleNewArticleNotification.mockImplementation(async (_unreadCount: number, _latest: unknown) => {
  return permissionGranted;
});

// 3 bài/lượt tải — id CÀNG LỚN CÀNG MỚI, index 0 LUÔN LÀ BÀI MỚI NHẤT (đúng hợp đồng
// `posts[0]` của `newsRefreshCycle.ts`).
const ARTICLE_A = {
  id: 101,
  date: '2026-09-01T08:00:00',
  titleHtml: '<p>Bài A</p>',
  excerptHtml: '',
  imageUrl: null,
  link: 'https://cbcentres.com/101',
};
const ARTICLE_B = {
  id: 102,
  date: '2026-09-01T09:00:00',
  titleHtml: '<p>Bài B</p>',
  excerptHtml: '',
  imageUrl: null,
  link: 'https://cbcentres.com/102',
};
const ARTICLE_C = {
  id: 103,
  date: '2026-09-01T10:00:00',
  titleHtml: '<p>Bài C (mới nhất lượt 1)</p>',
  excerptHtml: '',
  imageUrl: null,
  link: 'https://cbcentres.com/103',
};
const ARTICLE_D = {
  id: 104,
  date: '2026-09-02T08:00:00',
  titleHtml: '<p>Bài D (CB vừa đăng, mới nhất lượt 2)</p>',
  excerptHtml: '',
  imageUrl: null,
  link: 'https://cbcentres.com/104',
};

const FETCH_ROUND_1 = [ARTICLE_C, ARTICLE_B, ARTICLE_A]; // 3 bài, mới nhất = C
const FETCH_ROUND_2 = [ARTICLE_D, ARTICLE_C, ARTICLE_B]; // CB đăng D, đẩy A ra khỏi trang

describe('runNewsRefreshCycle — sáu dòng bảng DoD 4 (Task 314), MỘT câu chuyện liền mạch', () => {
  it('Dòng 1 — Mở app lần đầu: mốc=null, 3 bài chưa đọc, CHƯA có quyền → KHÔNG lên lịch được, mốc GIỮ NGUYÊN null', async () => {
    permissionGranted = false;
    mockFetchNewsPage.mockResolvedValueOnce({ posts: FETCH_ROUND_1, page: 1, totalPosts: 3, totalPages: 1 });

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).toHaveBeenCalledWith(3, ARTICLE_C);
    expect(result.notificationScheduled).toBe(false);
    expect(mockSetLastKnownArticleMarker).not.toHaveBeenCalled();
    expect(storedMarker).toBeNull();
  });

  it('Dòng 2 — Đọc bài A, được cấp quyền: NGOÀI vùng file (UI đọc bài + xin quyền), mô phỏng lại đúng hai hệ quả, mốc vẫn null', () => {
    readArticleIds.add(ARTICLE_A.id);
    permissionGranted = true;
    expect(storedMarker).toBeNull(); // dòng bảng: "Mốc sau" không đổi
  });

  it('Dòng 3 — Kéo làm mới: mốc=null, 2 bài chưa đọc (B,C — A đã đọc), CÓ quyền → lên lịch ĐƯỢC, mốc TIẾN = C', async () => {
    mockFetchNewsPage.mockResolvedValueOnce({ posts: FETCH_ROUND_1, page: 1, totalPosts: 3, totalPages: 1 });

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).toHaveBeenCalledWith(2, ARTICLE_C);
    expect(result.notificationScheduled).toBe(true);
    expect(storedMarker).toEqual({ id: ARTICLE_C.id, date: ARTICLE_C.date });
  });

  it('Dòng 4 — Ra khỏi tiền cảnh → banner hiện: hành vi OS, không kiểm được trong Jest (testEnvironment: node, không có AppState/thiết bị thật)', () => {
    // KHÔNG có assertion thật ở đây — giới hạn ĐÃ CÔNG KHAI, không phải bỏ sót lặng lẽ (xem
    // comment giao hàng Task 314). Bằng chứng gián tiếp: `notifications.ts` (Task 314) chỉ
    // đổi CHỮ trong `content.title`, không đụng `setNotificationHandler`/`trigger: null`;
    // `notifications.test.ts` (Task 305/308, KHÔNG sửa ở Task 314) đã khẳng định handler gọi
    // đúng 1 lần lúc nạp module với `shouldShowBanner: true` — cấu hình hiện banner giữ
    // nguyên qua Task 314.
  });

  it('Dòng 5 — Kéo làm mới lần nữa: mốc=C, newest vẫn C (chưa-đọc vẫn 2, không đổi) → vế 2 CHẶN, KHÔNG lên lịch, mốc KHÔNG đổi (chống spam)', async () => {
    mockFetchNewsPage.mockResolvedValueOnce({ posts: FETCH_ROUND_1, page: 1, totalPosts: 3, totalPages: 1 });
    mockScheduleNewArticleNotification.mockClear();

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).not.toHaveBeenCalled();
    expect(result.notificationScheduled).toBe(false);
    expect(storedMarker).toEqual({ id: ARTICLE_C.id, date: ARTICLE_C.date });
  });

  it('Dòng 6 — CB đăng bài D rồi làm mới: mốc=C, 3 bài chưa đọc (D,C,B), newest=D≠mốc → CÓ lên lịch, mốc TIẾN = D', async () => {
    mockFetchNewsPage.mockResolvedValueOnce({ posts: FETCH_ROUND_2, page: 1, totalPosts: 4, totalPages: 2 });

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).toHaveBeenCalledWith(3, ARTICLE_D);
    expect(result.notificationScheduled).toBe(true);
    expect(storedMarker).toEqual({ id: ARTICLE_D.id, date: ARTICLE_D.date });
  });
});

describe('runNewsRefreshCycle — mốc KHÔNG tiến khi lên lịch lỗi runtime (tách bạch khỏi ca bootstrap Dòng 1)', () => {
  it('marker ĐÃ khác null, có bài chưa đọc, scheduleNewArticleNotification trả false vì LỖI (không phải vì thiếu quyền) → mốc giữ nguyên', async () => {
    // Cô lập khỏi câu chuyện sáu dòng ở trên — override đúng một lượt gọi cho từng mock,
    // không phụ thuộc `storedMarker`/`readArticleIds` đang ở trạng thái nào.
    mockSetLastKnownArticleMarker.mockClear();
    mockGetLastKnownArticleMarker.mockImplementationOnce(async () => ({ id: 1, date: '2026-08-01T00:00:00' }));
    mockGetAllReadingProgress.mockImplementationOnce(async () => []); // không bài nào đã đọc
    mockScheduleNewArticleNotification.mockImplementationOnce(async () => false); // lỗi runtime
    mockFetchNewsPage.mockResolvedValueOnce({
      posts: [{ ...ARTICLE_B, id: 2 }],
      page: 1,
      totalPosts: 1,
      totalPages: 1,
    });

    const result = await runNewsRefreshCycle();

    expect(result.notificationScheduled).toBe(false);
    expect(mockSetLastKnownArticleMarker).not.toHaveBeenCalled();
  });
});
