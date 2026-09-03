/// <reference types="jest" />
/**
 * Task 305 (BLI 299) — việc ④ của handler bốn việc (`AD-18`) PHẢI CHỊU ĐƯỢC BỊ CẮT GIỮA
 * CHỪNG: idempotent, lượt sau tiếp tục được, không bao giờ để kho ở trạng thái nửa vời.
 *
 * Hai điều bài kiểm này phải chứng minh (DoD Task 305 mục 3):
 * 1. Bị cắt ở bài thứ hai (fetch ném lỗi) thì bài thứ nhất đã cache CÒN NGUYÊN, bài thứ
 *    hai KHÔNG xuất hiện dưới bất cứ dạng nửa vời nào (không key, không giá trị rỗng).
 * 2. Gọi lại lần hai với CÙNG danh sách: chỉ bài còn thiếu được fetch lại (không fetch lại
 *    bài đã cache — idempotent), và sau khi bài đó thành công thì cache đủ cả ba bài.
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

import { cacheArticlesForOfflineReading, getCachedArticle, getCachedArticleIds } from '../articleCache';

function detailOf(id: number) {
  return { id, link: `https://cbcentres.com/${id}`, date: '2026-09-03T00:00:00', titleHtml: `<p>t${id}</p>`, excerptHtml: '', imageUrl: null, contentHtml: `<p>noi dung ${id}</p>` };
}

beforeEach(() => {
  mockAsyncStorageMap.clear();
  mockFetchPostDetail.mockReset();
});

describe('cacheArticlesForOfflineReading — bị cắt giữa chừng KHÔNG để kho nửa vời', () => {
  it('bài 1 thành công, bài 2 lỗi: bài 1 còn nguyên, bài 2 KHÔNG xuất hiện dưới dạng nào', async () => {
    mockFetchPostDetail.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('mạng đứt giữa chừng — mô phỏng lượt nền bị cắt');
      return detailOf(id);
    });

    const outcome = await cacheArticlesForOfflineReading([{ id: 1 }, { id: 2 }]);

    expect(outcome).toEqual({ attempted: 2, cached: 1, failed: 1 });
    expect(await getCachedArticle(1)).toEqual(detailOf(1));
    expect(await getCachedArticle(2)).toBeNull();
    expect(await getCachedArticleIds()).toEqual([1]);
  });
});

describe('cacheArticlesForOfflineReading — idempotent, lượt sau CHỈ tải phần còn thiếu', () => {
  it('lượt 2 không fetch lại bài đã cache, chỉ fetch bài còn thiếu, rồi cache đủ cả ba', async () => {
    mockFetchPostDetail.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('lỗi lượt 1');
      return detailOf(id);
    });

    const summaries = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const first = await cacheArticlesForOfflineReading(summaries);
    expect(first).toEqual({ attempted: 3, cached: 2, failed: 1 });
    expect(await getCachedArticleIds().then((ids) => ids.sort())).toEqual([1, 3]);

    mockFetchPostDetail.mockReset();
    mockFetchPostDetail.mockImplementation(async (id: number) => detailOf(id));

    const second = await cacheArticlesForOfflineReading(summaries);

    // Chỉ gọi fetch cho bài 2 (bài còn thiếu) — KHÔNG gọi lại cho bài 1/3 đã cache.
    expect(mockFetchPostDetail).toHaveBeenCalledTimes(1);
    expect(mockFetchPostDetail).toHaveBeenCalledWith(2);
    expect(second).toEqual({ attempted: 1, cached: 1, failed: 0 });

    const finalIds = (await getCachedArticleIds()).sort();
    expect(finalIds).toEqual([1, 2, 3]);
    expect(await getCachedArticle(1)).toEqual(detailOf(1));
    expect(await getCachedArticle(3)).toEqual(detailOf(3));
  });
});
