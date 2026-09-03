/// <reference types="jest" />
/**
 * Task 305 (BLI 299) — handler bốn việc phải chạy ĐÚNG THỨ TỰ rẻ-trước-đắt-sau (`AD-18`,
 * `F2`), và mốc đồng-bộ phải được ghi NGAY SAU việc ③, KHÔNG sau việc ④ (DoD mục 4).
 *
 * Mock TOÀN BỘ các module phụ thuộc, mỗi hàm khi được gọi PUSH một nhãn vào mảng `callOrder`
 * dùng chung — bài kiểm so mảng đó với thứ tự kỳ vọng, thay vì chỉ kiểm từng hàm có được
 * gọi hay không (đúng yêu cầu brief: "phép thử chứng minh bốn việc chạy đúng thứ tự").
 *
 * Task 314 (BLI 299, `DoD 4`): thêm mock `../../data/readingProgress` — việc ② nay đọc
 * thêm nguồn này để đếm bài chưa đọc (`countUnreadPosts`) trước khi lên lịch thông báo. Sáu
 * trường hợp thử riêng cho điều kiện lên lịch/mốc chỉ tiến khi đã thông báo THẬT SỰ nằm ở
 * `newsRefreshCycle.notificationGate.test.ts` (đúng bảng 6 dòng của DoD 4) — file NÀY chỉ
 * còn giữ phần "đúng thứ tự bốn việc" (Task 305) và cập nhật mock cho khớp phụ thuộc mới,
 * không lặp lại các ca đó.
 */

const callOrder: string[] = [];

const mockFetchNewsPage = jest.fn();
jest.mock('../../api/newsApi', () => ({
  __esModule: true,
  fetchNewsPage: (...args: unknown[]) => mockFetchNewsPage(...args),
}));

const mockGetLastKnownArticleMarker = jest.fn();
const mockSetLastKnownArticleMarker = jest.fn();
const mockSetLastSyncedAt = jest.fn();
jest.mock('../../data/newsSyncState', () => ({
  __esModule: true,
  getLastKnownArticleMarker: (...args: unknown[]) => mockGetLastKnownArticleMarker(...args),
  setLastKnownArticleMarker: (...args: unknown[]) => mockSetLastKnownArticleMarker(...args),
  setLastSyncedAt: (...args: unknown[]) => mockSetLastSyncedAt(...args),
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

const mockScheduleNewArticleNotification = jest.fn();
jest.mock('../notifications', () => ({
  __esModule: true,
  scheduleNewArticleNotification: (...args: unknown[]) => mockScheduleNewArticleNotification(...args),
}));

const mockGetAllReadingProgress = jest.fn();
jest.mock('../../data/readingProgress', () => ({
  __esModule: true,
  getAllReadingProgress: (...args: unknown[]) => mockGetAllReadingProgress(...args),
}));

import { runNewsRefreshCycle } from '../newsRefreshCycle';

const NEWEST_POST = { id: 10, date: '2026-09-03T10:00:00', titleHtml: '<p>Mới</p>', excerptHtml: '', imageUrl: null, link: 'https://cbcentres.com/10' };
const OLDER_MARKER = { id: 5, date: '2026-09-02T10:00:00' };

beforeEach(() => {
  callOrder.length = 0;
  jest.clearAllMocks();

  mockFetchNewsPage.mockImplementation(async () => {
    callOrder.push('①fetch');
    return { posts: [NEWEST_POST], page: 1, totalPosts: 1, totalPages: 1 };
  });
  mockGetLastKnownArticleMarker.mockImplementation(async () => {
    callOrder.push('②getMarker');
    return OLDER_MARKER;
  });
  mockGetAllReadingProgress.mockImplementation(async () => {
    callOrder.push('②unread');
    return []; // không bản ghi nào → NEWEST_POST tính là chưa đọc
  });
  mockScheduleNewArticleNotification.mockImplementation(async () => {
    callOrder.push('②schedule');
    return true;
  });
  mockSetLastKnownArticleMarker.mockImplementation(async () => {
    callOrder.push('②setMarker');
  });
  mockWriteWidgetSnapshot.mockImplementation(async () => {
    callOrder.push('③widget');
  });
  mockSetLastSyncedAt.mockImplementation(async () => {
    callOrder.push('mốc-đồng-bộ');
  });
  mockCacheArticlesForOfflineReading.mockImplementation(async () => {
    callOrder.push('④cache');
    return { attempted: 0, cached: 0, failed: 0 };
  });
});

describe('runNewsRefreshCycle — đúng thứ tự bốn việc (AD-18)', () => {
  it('①fetch → ②so-mốc/lên-lịch → ③widget → mốc-đồng-bộ → ④cache, ĐÚNG thứ tự này', async () => {
    const result = await runNewsRefreshCycle();

    expect(callOrder).toEqual([
      '①fetch',
      '②getMarker',
      '②unread',
      '②schedule',
      '②setMarker',
      '③widget',
      'mốc-đồng-bộ',
      '④cache',
    ]);
    expect(result.ok).toBe(true);
    expect(result.newArticlesDetected).toBe(true);
    expect(result.notificationScheduled).toBe(true);
  });

  it('mốc đồng-bộ được ghi TRƯỚC việc ④, không phải sau', async () => {
    await runNewsRefreshCycle();
    const syncIndex = callOrder.indexOf('mốc-đồng-bộ');
    const cacheIndex = callOrder.indexOf('④cache');
    expect(syncIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeGreaterThan(syncIndex);
  });
});

describe('runNewsRefreshCycle — mốc đồng-bộ vẫn được ghi dù việc ④ hỏng HOÀN TOÀN', () => {
  it('cacheArticlesForOfflineReading reject toàn bộ → setLastSyncedAt vẫn đã chạy, chu trình vẫn resolve (ok:true)', async () => {
    mockCacheArticlesForOfflineReading.mockImplementation(async () => {
      callOrder.push('④cache-fail');
      throw new Error('hệ điều hành cắt lượt nền giữa chừng');
    });

    const result = await runNewsRefreshCycle();

    expect(mockSetLastSyncedAt).toHaveBeenCalledTimes(1);
    expect(callOrder.indexOf('mốc-đồng-bộ')).toBeLessThan(callOrder.indexOf('④cache-fail'));
    expect(result.ok).toBe(true);
    expect(result.offlineCache).toEqual({ attempted: 0, cached: 0, failed: 0 });
  });
});

describe('runNewsRefreshCycle — marker=null (bootstrap) VẪN thử lên lịch nếu có bài chưa đọc (Task 314, DoD 4)', () => {
  // Trước Task 314: marker=null bỏ qua thông báo hoàn toàn, chỉ thiết lập mốc. Sau Task
  // 314: marker=null cũng thoả vế-2 (newest khác mốc) — hành vi chi tiết (mốc chỉ tiến khi
  // đã thông báo THẬT SỰ) nằm ở `newsRefreshCycle.notificationGate.test.ts` hàng 1/3; test
  // này chỉ giữ lại quan sát "marker=null KHÔNG còn tự động bỏ qua việc gọi hàm lên lịch".
  it('marker=null, có bài chưa đọc → CÓ gọi scheduleNewArticleNotification (không còn im lặng bỏ qua)', async () => {
    mockGetLastKnownArticleMarker.mockImplementation(async () => {
      callOrder.push('②getMarker');
      return null;
    });

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).toHaveBeenCalledWith(1, NEWEST_POST);
    expect(result.newArticlesDetected).toBe(true);
    expect(result.notificationScheduled).toBe(true);
    expect(mockSetLastKnownArticleMarker).toHaveBeenCalledWith({ id: NEWEST_POST.id, date: NEWEST_POST.date });
  });
});

describe('runNewsRefreshCycle — việc ① lỗi thì dừng sớm, không làm việc ②③④', () => {
  it('fetchNewsPage ném lỗi → không gọi bất kỳ hàm nào khác', async () => {
    mockFetchNewsPage.mockImplementation(async () => {
      callOrder.push('①fetch-fail');
      throw new Error('mất mạng');
    });

    const result = await runNewsRefreshCycle();

    expect(result.ok).toBe(false);
    expect(mockGetLastKnownArticleMarker).not.toHaveBeenCalled();
    expect(mockWriteWidgetSnapshot).not.toHaveBeenCalled();
    expect(mockSetLastSyncedAt).not.toHaveBeenCalled();
    expect(mockCacheArticlesForOfflineReading).not.toHaveBeenCalled();
  });
});

describe('runNewsRefreshCycle — khoá đơn-luồng: hai lượt gọi gần như đồng thời chia sẻ MỘT lượt chạy', () => {
  it('gọi hai lần liên tiếp trước khi lượt đầu xong → chỉ MỘT lượt thật sự chạy (fetch chỉ gọi 1 lần)', async () => {
    const [a, b] = await Promise.all([runNewsRefreshCycle(), runNewsRefreshCycle()]);

    expect(mockFetchNewsPage).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe('runNewsRefreshCycle — KHÔNG BAO GIỜ reject, kể cả lỗi không lường trước ở việc ②', () => {
  it('setLastKnownArticleMarker ném lỗi bất thường → promise vẫn RESOLVE (không unhandled rejection)', async () => {
    mockSetLastKnownArticleMarker.mockImplementation(async () => {
      throw new Error('AsyncStorage đầy — lỗi không lường trước');
    });

    await expect(runNewsRefreshCycle()).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});
