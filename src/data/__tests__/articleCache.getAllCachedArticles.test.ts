/// <reference types="jest" />
/**
 * Task 315 (BLI 299, `AD-21`) — `getAllCachedArticles()` là nguồn cho khối ④ khi CHƯA đăng
 * nhập (`savedArticlesSearch.buildCachedSearchViewState`). Đọc lại đúng blob cache đã có
 * (Task 305), không lớp lưu trữ thứ hai — phép thử chỉ cần chứng minh đọc đúng, không lặp lại
 * các phép thử "bị cắt giữa chừng" đã có ở `articleCache.resumable.test.ts`.
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

const mockFetchPostDetail = jest.fn();
jest.mock('../../api/newsApi', () => ({
  __esModule: true,
  fetchPostDetail: (id: number) => mockFetchPostDetail(id),
}));

import { ARTICLE_CACHE_STORAGE_KEY, cacheArticlesForOfflineReading, getAllCachedArticles } from '../articleCache';

function detailOf(id: number) {
  return { id, link: `https://cbcentres.com/${id}`, date: '2026-09-03T00:00:00', titleHtml: `<p>t${id}</p>`, excerptHtml: '', imageUrl: null, contentHtml: `<p>noi dung ${id}</p>` };
}

beforeEach(() => {
  mockAsyncStorageMap.clear();
  mockFetchPostDetail.mockReset();
});

describe('getAllCachedArticles — nguồn cho tìm kiếm khối ④ khi CHƯA đăng nhập (Task 315)', () => {
  it('cache trống → mảng rỗng, không throw', async () => {
    expect(await getAllCachedArticles()).toEqual([]);
  });

  it('trả đúng toàn bộ bài đã cache, không thiếu không thừa', async () => {
    mockFetchPostDetail.mockImplementation(async (id: number) => detailOf(id));
    await cacheArticlesForOfflineReading([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const all = await getAllCachedArticles();

    expect(all.map((a) => a.id).sort()).toEqual([1, 2, 3]);
    expect(all.find((a) => a.id === 2)).toEqual(detailOf(2));
  });

  it('blob hỏng (JSON không hợp lệ) → mảng rỗng, không throw (best-effort, đúng khuôn readCache)', async () => {
    mockAsyncStorageMap.set(ARTICLE_CACHE_STORAGE_KEY, '{ khong phai json hop le');
    expect(await getAllCachedArticles()).toEqual([]);
  });
});
