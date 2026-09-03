/// <reference types="jest" />
/**
 * Task 305 (BLI 299) — handler bốn việc phải chạy ĐÚNG THỨ TỰ rẻ-trước-đắt-sau (`AD-18`,
 * `F2`), và mốc đồng-bộ phải được ghi NGAY SAU việc ③, KHÔNG sau việc ④ (DoD mục 4).
 *
 * Mock TOÀN BỘ các module phụ thuộc, mỗi hàm khi được gọi PUSH một nhãn vào mảng `callOrder`
 * dùng chung — bài kiểm so mảng đó với thứ tự kỳ vọng, thay vì chỉ kiểm từng hàm có được
 * gọi hay không (đúng yêu cầu brief: "phép thử chứng minh bốn việc chạy đúng thứ tự").
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

    expect(callOrder).toEqual(['①fetch', '②getMarker', '②schedule', '②setMarker', '③widget', 'mốc-đồng-bộ', '④cache']);
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

describe('runNewsRefreshCycle — bootstrap: lần đầu chưa có mốc đã-đọc thì KHÔNG thông báo', () => {
  it('marker=null → không gọi scheduleNewArticleNotification, vẫn thiết lập mốc mới', async () => {
    mockGetLastKnownArticleMarker.mockImplementation(async () => {
      callOrder.push('②getMarker');
      return null;
    });

    const result = await runNewsRefreshCycle();

    expect(mockScheduleNewArticleNotification).not.toHaveBeenCalled();
    expect(result.newArticlesDetected).toBe(false);
    expect(result.notificationScheduled).toBe(false);
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
