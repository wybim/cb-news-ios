/// <reference types="jest" />
/**
 * Task 301 (BLI 299) — cơ chế PHÂN VÙNG kho cục bộ (`AD-19`): phân vùng THIẾT BỊ (vô danh,
 * mặc định) và phân vùng TÀI KHOẢN (lớp phủ, chỉ khi đăng nhập), dùng chung đúng một khuôn
 * khoá `(provider, providerUserId)` mà Task 284 đã đặt cho bài lưu offline.
 *
 * Ba điều bài kiểm này phải chứng minh:
 * 1. Phân vùng thiết bị đọc/ghi được KHÔNG cần bất cứ trạng thái đăng nhập nào — bài kiểm
 *    dưới đây không import/gọi `accountStore` một lần nào.
 * 2. `buildPartitionStorageKey()` (cơ chế MỚI) tạo ra ĐÚNG khoá mà `savedArticles.ts`
 *    (Task 284) đã tạo trước Task 301 — tức việc chuyển sang cơ chế chung không đổi định
 *    dạng khoá đang có trên máy người dùng thật.
 * 3. Hai phân vùng KHÔNG đụng khoá của nhau, kể cả khi `providerUserId` trùng nhau tình cờ.
 *
 * Dùng khoá thử `cbnews.__mechanism_test__.v1` — một tiền tố CHỈ tồn tại trong bài kiểm
 * này, không phải một loại dữ liệu sản phẩm nào (task này không tạo dữ liệu của task sau).
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEVICE_PARTITION,
  DEVICE_PARTITION_PROVIDER,
  accountPartition,
  buildPartitionStorageKey,
  isDevicePartition,
} from '../localPartitions';

const TEST_FEATURE_PREFIX = 'cbnews.__mechanism_test__.v1';

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
});

describe('localPartitions — phân vùng THIẾT BỊ đọc/ghi được khi CHƯA đăng nhập (AD-19, AD-22)', () => {
  it('ghi rồi đọc lại đúng giá trị qua đúng khoá phân vùng thiết bị — không cần accountStore, không cần phiên đăng nhập', async () => {
    const key = buildPartitionStorageKey(TEST_FEATURE_PREFIX, DEVICE_PARTITION);

    // Chưa từng ghi gì — đọc phải ra null, không throw, không đòi hỏi trạng thái đăng nhập.
    expect(await AsyncStorage.getItem(key)).toBeNull();

    await AsyncStorage.setItem(key, JSON.stringify({ hello: 'device' }));
    const raw = await AsyncStorage.getItem(key);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ hello: 'device' });
  });

  it('khoá phân vùng thiết bị mang đúng provider canh riêng "local", không phải một AccountProvider thật', () => {
    expect(DEVICE_PARTITION.provider).toBe('local');
    expect(DEVICE_PARTITION_PROVIDER).toBe('local');
    expect(isDevicePartition(DEVICE_PARTITION)).toBe(true);
  });
});

describe('localPartitions — phân vùng TÀI KHOẢN vẫn tách đúng theo (provider, providerUserId)', () => {
  it('accountPartition() KHÔNG bị coi là phân vùng thiết bị', () => {
    const partition = accountPartition({ provider: 'apple', providerUserId: 'user-1' });
    expect(isDevicePartition(partition)).toBe(false);
  });

  it('hai tài khoản khác nhau (kể cả khác provider) tạo ra hai khoá khác nhau', () => {
    const keyApple = buildPartitionStorageKey(
      TEST_FEATURE_PREFIX,
      accountPartition({ provider: 'apple', providerUserId: 'same-id' }),
    );
    const keyGoogle = buildPartitionStorageKey(
      TEST_FEATURE_PREFIX,
      accountPartition({ provider: 'google', providerUserId: 'same-id' }),
    );
    expect(keyApple).not.toBe(keyGoogle);
  });

  it('không đụng khoá của phân vùng thiết bị dù trùng providerUserId', () => {
    const keyDevice = buildPartitionStorageKey(TEST_FEATURE_PREFIX, DEVICE_PARTITION);
    const keyAccount = buildPartitionStorageKey(
      TEST_FEATURE_PREFIX,
      accountPartition({ provider: 'apple', providerUserId: DEVICE_PARTITION.providerUserId }),
    );
    expect(keyDevice).not.toBe(keyAccount);
  });
});

describe('localPartitions — di trú savedArticles sang cơ chế chung KHÔNG đổi định dạng khoá cũ', () => {
  it('buildPartitionStorageKey() tạo đúng chuỗi mà buildSavedArticlesStorageKey() (Task 284) đã tạo', () => {
    // So khớp trực tiếp với định dạng gốc `<prefix>.<provider>:<providerUserId>` mà Task 284
    // đã đặt (`cbnews.savedArticles.v1.<provider>:<providerUserId>`), không import lại
    // `savedArticles.ts` để tránh vòng phụ thuộc test — chuỗi hằng dưới đây khớp
    // `SAVED_ARTICLES_STORAGE_KEY_PREFIX` đang khai trong `savedArticles.ts`.
    const key = buildPartitionStorageKey(
      'cbnews.savedArticles.v1',
      accountPartition({ provider: 'apple', providerUserId: 'legacy-format-check' }),
    );
    expect(key).toBe('cbnews.savedArticles.v1.apple:legacy-format-check');
  });
});
