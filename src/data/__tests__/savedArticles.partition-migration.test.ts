/// <reference types="jest" />
/**
 * Task 301 (BLI 299) — `savedArticles.ts` chuyển sang dùng cơ chế phân vùng chung
 * (`localPartitions.ts`) thay vì tự nối chuỗi khoá. File này KHÔNG lặp lại bốn hành vi Task
 * 284 đã có bộ thử riêng (`savedArticles.per-account.test.ts` — không sửa) — nó chỉ chứng
 * minh đúng một điều hẹp: hàm khoá công khai `buildSavedArticlesStorageKey()` trả về ĐÚNG
 * chuỗi như trước khi di trú, để dữ liệu đã có trên máy người dùng thật (Task 284) đọc lại
 * được sau bản vá này.
 */

// `savedArticles.ts` import module gốc `@react-native-async-storage/async-storage` (ESM,
// jest không load thẳng được ở CommonJS — đúng cách `savedArticles.per-account.test.ts` đã
// mock). Bài kiểm này chỉ gọi hàm dựng khoá thuần, không đọc/ghi đĩa, nên mock rỗng là đủ.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

import { buildSavedArticlesStorageKey, SAVED_ARTICLES_STORAGE_KEY_PREFIX } from '../savedArticles';

describe('savedArticles — buildSavedArticlesStorageKey() giữ nguyên định dạng khoá sau khi chuyển sang cơ chế phân vùng chung', () => {
  it('vẫn là `<prefix>.<provider>:<providerUserId>`, đúng tiền tố cũ', () => {
    expect(SAVED_ARTICLES_STORAGE_KEY_PREFIX).toBe('cbnews.savedArticles.v1');
    expect(buildSavedArticlesStorageKey('apple', 'abc-123')).toBe('cbnews.savedArticles.v1.apple:abc-123');
    expect(buildSavedArticlesStorageKey('google', 'xyz-999')).toBe('cbnews.savedArticles.v1.google:xyz-999');
  });
});
