/// <reference types="jest" />
/**
 * Task 301 (BLI 299) — cơ chế PHÂN LOẠI XOÁ theo từng khoá (`AD-23`): phân vùng thiết bị
 * chứa CẢ HAI loại dữ liệu — loại nói về CON NGƯỜI (phải bị quét khi xoá tài khoản) và loại
 * là bản sao nội dung công cộng (không bị quét). Việc phân loại KHÔNG suy ra được từ tên
 * phân vùng, nên mỗi khoá tự khai cờ `sweepOnAccountDeletion`.
 *
 * Phép thử BẮT BUỘC PHẢI PHÂN ĐỊNH ĐƯỢC (brief Task 301): trong CÙNG một lượt gọi, khoá
 * khai `true` phải MẤT, khoá khai `false` phải CÒN — hai quan sát ngược chiều nhau trong
 * cùng một bài kiểm, không phải một tiêu chí luôn đạt (kb/lessons/2026-08-29-tieu-chi-
 * nghiem-thu-dua-tren-hanh-vi-chua-do.md).
 *
 * Hai khoá dùng trong `describe` đầu tiên là tổng hợp riêng cho bài kiểm này (tiền tố
 * `cbnews.__mechanism_test__`) — KHÔNG phải một loại dữ liệu sản phẩm nào của task sau
 * (task 301 chỉ giao cơ chế, không giao dữ liệu).
 */

const mockAsyncStorageMap = new Map<string, string>();
const mockSecureStoreMap = new Map<string, string>();

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

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (key: string) =>
    mockSecureStoreMap.has(key) ? mockSecureStoreMap.get(key)! : null,
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreMap.delete(key);
  }),
}));

// `localUserData.ts` import `APPLE_AUTH_CODE_STORAGE_KEY` từ `../auth/appleAuth`, và file đó
// import module gốc `expo-apple-authentication` (ESM, jest không load thẳng được — đúng
// cách `deleteAccount.*.test.ts` đã mock). Chỉ cần hằng số chuỗi, không cần hành vi thật.
jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  LOCAL_USER_DATA_KEYS,
  clearAllLocalUserData,
  sweepLocalUserDataEntries,
  type LocalUserDataEntry,
} from '../localUserData';
import { buildSavedArticlesStorageKey } from '../savedArticles';
import { ACCOUNT_STORAGE_KEY } from '../../state/accountStore';
import { APPLE_AUTH_CODE_STORAGE_KEY } from '../../auth/appleAuth';
import { READING_PROGRESS_STORAGE_KEY } from '../readingProgress';
import { LAST_KNOWN_ARTICLE_MARKER_STORAGE_KEY, LAST_SYNCED_AT_STORAGE_KEY } from '../newsSyncState';
import { ARTICLE_CACHE_STORAGE_KEY } from '../articleCache';
import { WIDGET_SNAPSHOT_STORAGE_KEY } from '../widgetSnapshot';

beforeEach(() => {
  mockAsyncStorageMap.clear();
  mockSecureStoreMap.clear();
  jest.clearAllMocks();
});

describe('sweepLocalUserDataEntries — cơ chế phân loại PHÂN ĐỊNH ĐƯỢC (AD-23)', () => {
  it('trong CÙNG một lượt gọi: khoá khai sweepOnAccountDeletion=true thì MẤT, khoá khai false thì CÒN', async () => {
    const sweptKey = 'cbnews.__mechanism_test__.read-marker.v1'; // giả lập "nói về con người"
    const keptKey = 'cbnews.__mechanism_test__.public-cache.v1'; // giả lập "nội dung công cộng"

    await AsyncStorage.setItem(sweptKey, 'du-lieu-ve-con-nguoi');
    await AsyncStorage.setItem(keptKey, 'noi-dung-cong-cong');

    const entries: LocalUserDataEntry[] = [
      { key: sweptKey, backend: 'async-storage', sweepOnAccountDeletion: true },
      { key: keptKey, backend: 'async-storage', sweepOnAccountDeletion: false },
    ];

    await sweepLocalUserDataEntries(entries);

    expect(await AsyncStorage.getItem(sweptKey)).toBeNull(); // bị quét
    expect(await AsyncStorage.getItem(keptKey)).toBe('noi-dung-cong-cong'); // còn nguyên
  });

  it('phân định được trên cả backend secure-store, không chỉ async-storage', async () => {
    const sweptKey = 'cbnews.__mechanism_test__.secure.swept.v1';
    const keptKey = 'cbnews.__mechanism_test__.secure.kept.v1';

    await SecureStore.setItemAsync(sweptKey, 'a');
    await SecureStore.setItemAsync(keptKey, 'b');

    await sweepLocalUserDataEntries([
      { key: sweptKey, backend: 'secure-store', sweepOnAccountDeletion: true },
      { key: keptKey, backend: 'secure-store', sweepOnAccountDeletion: false },
    ]);

    expect(await SecureStore.getItemAsync(sweptKey)).toBeNull();
    expect(await SecureStore.getItemAsync(keptKey)).toBe('b');
  });
});

describe('LOCAL_USER_DATA_KEYS — hành vi hiện có KHÔNG đổi sau Task 301 (DoD mục 4)', () => {
  // Task 305 thêm ba khoá `sweepOnAccountDeletion: false` vào mảng này — hai bài kiểm
  // dưới đây CHỈ còn đúng cho hai khoá tĩnh GỐC (secure-store), không phải cho TOÀN BỘ
  // mảng nữa. Bài kiểm cho khoá mới của Task 305 nằm ở describe block riêng bên dưới.
  const legacySecureStoreKeys = [ACCOUNT_STORAGE_KEY, APPLE_AUTH_CODE_STORAGE_KEY];

  it('hai khoá tĩnh gốc (secure-store) vẫn khai sweepOnAccountDeletion=true (vẫn bị quét như cũ)', () => {
    const legacyEntries = LOCAL_USER_DATA_KEYS.filter((e) => legacySecureStoreKeys.includes(e.key));
    expect(legacyEntries).toHaveLength(2);
    for (const entry of legacyEntries) {
      expect(entry.sweepOnAccountDeletion).toBe(true);
    }
  });

  it('clearAllLocalUserData(): hai khoá tĩnh gốc + khoá bài lưu của tài khoản đều bị quét', async () => {
    const account = { provider: 'apple' as const, providerUserId: 'sweep-check-user' };
    for (const key of legacySecureStoreKeys) {
      await SecureStore.setItemAsync(key, 'x');
    }
    const savedArticlesKey = buildSavedArticlesStorageKey(account.provider, account.providerUserId);
    await AsyncStorage.setItem(savedArticlesKey, JSON.stringify({}));

    await clearAllLocalUserData(account);

    for (const key of legacySecureStoreKeys) {
      expect(await SecureStore.getItemAsync(key)).toBeNull();
    }
    expect(await AsyncStorage.getItem(savedArticlesKey)).toBeNull();
  });
});

describe('LOCAL_USER_DATA_KEYS — năm khoá mới của Task 305 (AD-23) PHÂN ĐỊNH ĐƯỢC', () => {
  // Đúng yêu cầu brief Task 305: trong CÙNG một lượt gọi clearAllLocalUserData(), khoá
  // khai true (nói về con người) phải MẤT, khoá khai false (bản sao công cộng/số đo)
  // phải CÒN — hai quan sát ngược chiều nhau, dùng thẳng mảng LOCAL_USER_DATA_KEYS thật
  // (không phải danh sách tổng hợp riêng cho bài kiểm), nên đây là bằng chứng mạnh hơn
  // bài kiểm cơ chế thuần tuý ở describe đầu file.
  const sweptKeys = [READING_PROGRESS_STORAGE_KEY, LAST_KNOWN_ARTICLE_MARKER_STORAGE_KEY];
  const keptKeys = [LAST_SYNCED_AT_STORAGE_KEY, ARTICLE_CACHE_STORAGE_KEY, WIDGET_SNAPSHOT_STORAGE_KEY];

  it('mọi khoá mới đều đã đăng ký vào LOCAL_USER_DATA_KEYS với backend async-storage', () => {
    for (const key of [...sweptKeys, ...keptKeys]) {
      const entry = LOCAL_USER_DATA_KEYS.find((e) => e.key === key);
      expect(entry).toBeDefined();
      expect(entry?.backend).toBe('async-storage');
    }
  });

  it('clearAllLocalUserData(): hai khoá "nói về con người" mất, ba khoá "công cộng/số đo" còn — trong CÙNG một lượt gọi', async () => {
    for (const key of [...sweptKeys, ...keptKeys]) {
      await AsyncStorage.setItem(key, 'gia-tri-thu');
    }

    await clearAllLocalUserData(null);

    for (const key of sweptKeys) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
    for (const key of keptKeys) {
      expect(await AsyncStorage.getItem(key)).toBe('gia-tri-thu');
    }
  });
});
