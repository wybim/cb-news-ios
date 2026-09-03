/// <reference types="jest" />
/**
 * Task 310 (BLI 299, AD-20) — phép thử cho phần CHẠY ĐƯỢC BẰNG JAVASCRIPT của widget: mọi
 * thứ tới trước cửa native (`writeWidgetSnapshot()` ghi cả bản cục bộ lẫn bản App Group).
 * Phần Swift (`targets/widget/widget.swift`) không tự kiểm được ở đây — máy KB không có
 * Xcode (xem comment giao hàng Task 310).
 *
 * Mock hai native module theo ĐÚNG quy ước đã có trong repo (mỗi test file tự mock, không
 * có `__mocks__/` toàn cục — xem `savedArticles.per-account.test.ts`,
 * `readingProgress.test.ts`):
 *  - `@react-native-async-storage/async-storage` — Map trong bộ nhớ.
 *  - `@bacons/apple-targets` — bắt buộc phải mock: `require()` module thật trong Node/Jest
 *    ném `ReferenceError: expo is not defined` (đo được thật khi khảo sát Task 310 — mã
 *    nguồn gói đọc biến toàn cục `expo` ngay khi nạp module, biến đó chỉ tồn tại ở runtime
 *    Expo/React Native thật).
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

// Biến "mock*" — babel-plugin-jest-hoist chỉ cho phép factory của `jest.mock()` đọc biến
// out-of-scope có tên bắt đầu bằng "mock" (đúng quy ước đã dùng trong `deleteAccount.*.test.ts`).
const mockExtensionStorageConstructor = jest.fn();
const mockExtensionStorageSet = jest.fn();
const mockReloadWidget = jest.fn();

jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: class {
    constructor(appGroup: string) {
      mockExtensionStorageConstructor(appGroup);
    }
    set(key: string, value: unknown) {
      mockExtensionStorageSet(key, value);
    }
    static reloadWidget(...args: unknown[]) {
      mockReloadWidget(...args);
    }
  },
}));

import {
  writeWidgetSnapshot,
  readWidgetSnapshot,
  WIDGET_APP_GROUP_ID,
  WIDGET_APP_GROUP_SNAPSHOT_KEY,
  WIDGET_SNAPSHOT_ITEM_LIMIT,
  type WidgetAppGroupPayload,
} from '../widgetSnapshot';
import { buildSavedArticlesStorageKey } from '../savedArticles';
import { inlineTextOnly } from '../../utils/htmlParser';
import type { PostSummary } from '../../api/newsApi';

function makePost(id: number, overrides: Partial<PostSummary> = {}): PostSummary {
  return {
    id,
    link: `https://cbcentres.com/bai-${id}`,
    date: `2026-09-0${(id % 9) + 1}T08:00:00`,
    titleHtml: `<strong>Tieu de</strong> so ${id}`,
    excerptHtml: '<p>tom tat</p>',
    imageUrl: `https://cbcentres.com/anh-${id}.jpg`,
    ...overrides,
  };
}

/** Đọc lại payload App Group vừa ghi (lần gọi `set()` gần nhất) — giải mã đúng đường
 *  `writeWidgetSnapshot()` dùng thật: một chuỗi JSON qua `setString`. */
function lastAppGroupPayload(): WidgetAppGroupPayload {
  expect(mockExtensionStorageSet).toHaveBeenCalled();
  const lastCall = mockExtensionStorageSet.mock.calls.at(-1)!;
  const [key, rawValue] = lastCall as [string, unknown];
  expect(key).toBe(WIDGET_APP_GROUP_SNAPSHOT_KEY);
  expect(typeof rawValue).toBe('string');
  return JSON.parse(rawValue as string) as WidgetAppGroupPayload;
}

beforeEach(() => {
  mockAsyncStorageMap.clear();
  mockExtensionStorageConstructor.mockClear();
  mockExtensionStorageSet.mockClear();
  mockReloadWidget.mockClear();
});

describe('writeWidgetSnapshot — khuôn payload App Group', () => {
  it('ghi đúng App Group id đã khai trong app.config.js/expo-target.config.js', async () => {
    await writeWidgetSnapshot([makePost(1)]);
    expect(mockExtensionStorageConstructor).toHaveBeenCalledWith(WIDGET_APP_GROUP_ID);
  });

  it('title là chữ thường đã bóc HTML (Swift không tự parse HTML) — không phải titleHtml', async () => {
    const post = makePost(1, { titleHtml: '<strong>Tin</strong> <em>khẩn</em>: bão số 3' });
    await writeWidgetSnapshot([post]);
    const payload = lastAppGroupPayload();
    expect(payload.items[0].title).toBe(inlineTextOnly(post.titleHtml));
    expect(payload.items[0].title).not.toContain('<');
  });

  it('giới hạn đúng WIDGET_SNAPSHOT_ITEM_LIMIT bài, giữ nguyên id/date/imageUrl/deepLink', async () => {
    const posts = Array.from({ length: WIDGET_SNAPSHOT_ITEM_LIMIT + 4 }, (_, i) => makePost(i + 1));
    await writeWidgetSnapshot(posts);
    const payload = lastAppGroupPayload();
    expect(payload.items).toHaveLength(WIDGET_SNAPSHOT_ITEM_LIMIT);
    expect(payload.items[0]).toEqual({
      id: posts[0].id,
      title: inlineTextOnly(posts[0].titleHtml),
      date: posts[0].date,
      imageUrl: posts[0].imageUrl,
      deepLink: posts[0].link,
    });
  });

  it('imageUrl null giữ nguyên null qua JSON (không đổi thành chuỗi rỗng/undefined)', async () => {
    await writeWidgetSnapshot([makePost(1, { imageUrl: null })]);
    const payload = lastAppGroupPayload();
    expect(payload.items[0].imageUrl).toBeNull();
  });

  it('gọi ExtensionStorage.reloadWidget() sau khi ghi — dùng cơ chế làm mới của hệ thống (F5/AD-18), không tự dựng lượt nền thứ hai', async () => {
    await writeWidgetSnapshot([makePost(1)]);
    expect(mockReloadWidget).toHaveBeenCalledTimes(1);
  });
});

describe('writeWidgetSnapshot — ghi được khi CHƯA đăng nhập (AD-22)', () => {
  it('thành công mà không cần bất kỳ trạng thái tài khoản/phiên đăng nhập nào', async () => {
    // Không seed accountStore, không seed savedArticles của bất kỳ tài khoản nào — đúng
    // trạng thái "máy sạch, chưa ai đăng nhập". Hàm KHÔNG import accountStore/savedArticles
    // nên không có cách nào để việc thiếu phiên đăng nhập chặn được nó.
    await expect(writeWidgetSnapshot([makePost(1), makePost(2)])).resolves.toBeUndefined();

    const local = await readWidgetSnapshot();
    expect(local?.items).toHaveLength(2);

    const appGroupPayload = lastAppGroupPayload();
    expect(appGroupPayload.items).toHaveLength(2);
  });
});

describe('writeWidgetSnapshot — phân định được: CHỈ nội dung công cộng (AD-20)', () => {
  it('bài thuộc phân vùng TÀI KHOẢN không xuất hiện trong payload App Group dù đang nằm trên máy', async () => {
    const PRIVATE_MARKER = 'CHI-RIENG-TAI-KHOAN-KHONG-DUOC-LO-RA-WIDGET';

    // Seed thẳng AsyncStorage dưới đúng khoá phân vùng TÀI KHOẢN (accountPartition) mà
    // `savedArticles.ts` dùng thật — mô phỏng "trên máy đang có bài đã lưu của một tài
    // khoản đã đăng nhập", KHÔNG đi qua savedArticlesStore để bài kiểm không phụ thuộc
    // trạng thái module singleton của nó.
    const accountKey = buildSavedArticlesStorageKey('apple', 'nguoi-dung-that');
    mockAsyncStorageMap.set(
      accountKey,
      JSON.stringify([
        {
          id: 999999,
          link: 'https://cbcentres.com/bai-rieng-tu',
          date: '2026-09-01T00:00:00',
          titleHtml: `<p>${PRIVATE_MARKER}</p>`,
          excerptHtml: '<p>...</p>',
          imageUrl: null,
          contentHtml: '<p>noi dung rieng tu</p>',
          savedAt: '2026-09-01T00:00:01.000Z',
        },
      ]),
    );

    // Danh sách công khai đưa vào KHÔNG chứa bài riêng tư ở trên — đúng luồng thật:
    // `writeWidgetSnapshot()` chỉ nhận `posts` từ `newsApi` (danh sách công khai).
    await writeWidgetSnapshot([makePost(1), makePost(2)]);

    const appGroupPayload = lastAppGroupPayload();
    const appGroupJson = JSON.stringify(appGroupPayload);
    expect(appGroupJson).not.toContain(PRIVATE_MARKER);
    expect(appGroupJson).not.toContain('999999');

    // Bản cục bộ (AsyncStorage, đích Task 305) cũng phải sạch — cùng payload nguồn.
    const local = await readWidgetSnapshot();
    expect(JSON.stringify(local)).not.toContain(PRIVATE_MARKER);

    // Bài riêng tư vẫn còn nguyên trên máy (task này không được đụng/xoá phân vùng tài
    // khoản) — phân định đúng nghĩa "có mặt nhưng không rò rỉ", không phải "không seed được".
    expect(mockAsyncStorageMap.get(accountKey)).toContain(PRIVATE_MARKER);
  });
});
