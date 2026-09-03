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
  it('hai khoá tĩnh đang có vẫn khai sweepOnAccountDeletion=true (vẫn bị quét như cũ)', () => {
    for (const entry of LOCAL_USER_DATA_KEYS) {
      expect(entry.sweepOnAccountDeletion).toBe(true);
    }
  });

  it('clearAllLocalUserData(): ba khoá đang có (2 khoá tĩnh + khoá bài lưu của tài khoản) đều bị quét', async () => {
    const account = { provider: 'apple' as const, providerUserId: 'sweep-check-user' };
    for (const entry of LOCAL_USER_DATA_KEYS) {
      await SecureStore.setItemAsync(entry.key, 'x');
    }
    const savedArticlesKey = buildSavedArticlesStorageKey(account.provider, account.providerUserId);
    await AsyncStorage.setItem(savedArticlesKey, JSON.stringify({}));

    await clearAllLocalUserData(account);

    for (const entry of LOCAL_USER_DATA_KEYS) {
      expect(await SecureStore.getItemAsync(entry.key)).toBeNull();
    }
    expect(await AsyncStorage.getItem(savedArticlesKey)).toBeNull();
  });
});
