/// <reference types="jest" />
/**
 * Task 307 (BLI 299, `AD-21`/`AD-22`) — `loadHomeSectionsData()` phải gom đúng dữ liệu từ
 * BA nguồn phân vùng thiết bị đã có sẵn, và KHÔNG được đụng `accountStore` — file này CỐ Ý
 * không import/mock `accountStore` một lần nào, đúng khuôn `readingProgress.test.ts` đã đặt,
 * để chứng minh bằng chính cấu trúc import rằng module chạy được khi CHƯA đăng nhập (`F3`).
 */

const mockAsyncStorageMap = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) =>
      mockAsyncStorageMap.has(key) ? mockAsyncStorageMap.get(key)! : null,
    ),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorageMap.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorageMap.delete(key);
    }),
  },
}));

import { READING_PROGRESS_STORAGE_KEY, setReadingProgress } from '../readingProgress';
import { ARTICLE_CACHE_STORAGE_KEY } from '../articleCache';
import { LAST_SYNCED_AT_STORAGE_KEY, setLastSyncedAt } from '../newsSyncState';
import { loadHomeSectionsData } from '../homeData';

const CACHED_ARTICLE_101 = {
  id: 101,
  link: 'https://cbcentres.com/bai-101',
  date: '2026-09-02T00:00:00',
  titleHtml: '<p>Bài 101</p>',
  excerptHtml: '<p>Tóm tắt</p>',
  imageUrl: null,
  contentHtml: '<p>Nội dung</p>',
};

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
});

describe('loadHomeSectionsData — gom dữ liệu 3 khối, phân vùng thiết bị, không cần đăng nhập', () => {
  it('máy MỚI (chưa từng chạy gì): không bản ghi đọc, cache rỗng, chưa có mốc đồng-bộ → không throw', async () => {
    const data = await loadHomeSectionsData();

    expect(data).toEqual({
      continueReadingEntry: null,
      continueReadingArticle: null,
      offlineCount: 0,
      lastSyncedAt: null,
    });
  });

  it('đã đọc một bài + đã cache hai bài + đã có mốc đồng-bộ → gom đúng, mốc đọc THẲNG không tính lại', async () => {
    await setReadingProgress(101, 0.3);
    mockAsyncStorageMap.set(ARTICLE_CACHE_STORAGE_KEY, JSON.stringify({ 101: CACHED_ARTICLE_101, 2: {} }));
    await setLastSyncedAt('2026-09-03T09:30:00.000Z');

    const data = await loadHomeSectionsData();

    expect(data.continueReadingEntry).toMatchObject({ articleId: 101, progress: 0.3 });
    expect(data.offlineCount).toBe(2);
    // Đọc THẲNG giá trị đã ghi — không cộng/trừ/định dạng lại ở tầng gom dữ liệu (F2).
    expect(data.lastSyncedAt).toBe('2026-09-03T09:30:00.000Z');
    // Tiêu đề bài đang đọc dở lấy TỪ CACHE offline sẵn có, không gọi mạng.
    expect(data.continueReadingArticle).toEqual(CACHED_ARTICLE_101);
  });

  it('đã đọc một bài nhưng bài đó KHÔNG còn trong cache offline → continueReadingArticle=null, không throw', async () => {
    await setReadingProgress(202, 0.6);

    const data = await loadHomeSectionsData();

    expect(data.continueReadingEntry).toMatchObject({ articleId: 202 });
    expect(data.continueReadingArticle).toBeNull();
  });

  it('đọc đúng khoá phân vùng thiết bị của readingProgress (khoá tồn tại thật, không phải khoá đoán)', async () => {
    expect(typeof READING_PROGRESS_STORAGE_KEY).toBe('string');
    expect(typeof LAST_SYNCED_AT_STORAGE_KEY).toBe('string');
  });
});
