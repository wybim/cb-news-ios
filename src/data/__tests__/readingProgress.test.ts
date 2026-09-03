/// <reference types="jest" />
/**
 * Task 305 (BLI 299) — bản ghi trạng thái đọc phải đọc/ghi được KHI CHƯA ĐĂNG NHẬP
 * (`AD-19`/`AD-22`): bài kiểm dưới đây KHÔNG import/gọi `accountStore` một lần nào, đúng
 * khuôn `localPartitions.test.ts` (Task 301) đã đặt.
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

import {
  getAllReadingProgress,
  getReadingProgress,
  setReadingProgress,
} from '../readingProgress';

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
});

describe('readingProgress — đọc/ghi được KHI CHƯA ĐĂNG NHẬP (AD-19, AD-22)', () => {
  it('chưa từng ghi thì đọc ra null, không throw', async () => {
    expect(await getReadingProgress(101)).toBeNull();
    expect(await getAllReadingProgress()).toEqual([]);
  });

  it('ghi rồi đọc lại đúng tiến độ, kèm lastReadAt tự sinh', async () => {
    const before = Date.now();
    await setReadingProgress(101, 0.42);
    const entry = await getReadingProgress(101);

    expect(entry).not.toBeNull();
    expect(entry?.articleId).toBe(101);
    expect(entry?.progress).toBe(0.42);
    expect(new Date(entry!.lastReadAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('ghi nhiều bài không đè lên nhau; getAllReadingProgress trả đủ mọi bài', async () => {
    await setReadingProgress(1, 0.1);
    await setReadingProgress(2, 0.9);

    const all = await getAllReadingProgress();
    expect(all).toHaveLength(2);
    expect(await getReadingProgress(1)).toMatchObject({ articleId: 1, progress: 0.1 });
    expect(await getReadingProgress(2)).toMatchObject({ articleId: 2, progress: 0.9 });
  });

  it('ghi lại cùng một bài thì CẬP NHẬT tiến độ, không tạo bản ghi trùng', async () => {
    await setReadingProgress(5, 0.2);
    await setReadingProgress(5, 0.8);

    const all = await getAllReadingProgress();
    expect(all).toHaveLength(1);
    expect(all[0].progress).toBe(0.8);
  });
});
