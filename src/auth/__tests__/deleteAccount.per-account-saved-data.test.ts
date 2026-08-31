/// <reference types="jest" />
/**
 * Task 284 (BLI 258) — HV3 của brief: "A xoá tài khoản → bài của A biến mất → B đăng
 * nhập → bài của B còn nguyên", cộng DoD mục 3 "vẫn dọn khoá mã Apple cũ"
 * (`APPLE_AUTH_CODE_STORAGE_KEY`, F4).
 *
 * Đo qua đúng đường thật `deleteAccount()` → `clearAllLocalUserData(account)` →
 * `savedArticlesStore` — không mock các module này (đo đúng đối tượng, xem
 * kb/lessons/2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md). Dùng tài khoản
 * Google cho nhánh xoá (không có luồng Alert/Apple revoke — nhánh đó đã có bộ test riêng
 * ở `deleteAccount.apple-flow.test.ts`, không lặp lại ở đây).
 *
 * Cách gọi `savedArticlesStore.syncToAccount()` thủ công dưới đây mô phỏng đúng việc
 * `App.tsx` làm khi `useAccountState()` đổi giá trị (không dựng React ở đây) — xem
 * `App.tsx`: effect theo dõi `account` gọi `syncToAccount()` mỗi khi tài khoản đổi.
 */

const mockAsyncStorageMap = new Map<string, string>();

jest.mock('react-native', () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

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

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  GoogleSignin: {
    configure: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    revokeAccess: jest.fn(),
  },
  isSuccessResponse: jest.fn(() => false),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

import * as SecureStore from 'expo-secure-store';
import { accountStore } from '../../state/accountStore';
import { LOCAL_USER_DATA_KEYS } from '../../data/localUserData';
import { savedArticlesStore, buildSavedArticlesStorageKey } from '../../data/savedArticles';
import { deleteAccount } from '../deleteAccount';
import type { PostDetail } from '../../api/newsApi';

function makeArticle(id: number): PostDetail {
  return {
    id,
    link: `https://cbcentres.com/bai-${id}`,
    date: '2026-08-31T00:00:00',
    titleHtml: `<p>Bai ${id}</p>`,
    excerptHtml: '<p>tom tat</p>',
    imageUrl: null,
    contentHtml: '<p>noi dung day du</p>',
  };
}

/**
 * Dùng khi GHI THẲNG dữ liệu giả xuống mock đĩa (bỏ qua `saveArticle()`) — bản ghi thật
 * trên đĩa luôn có `savedAt` (do `saveArticle()` tự gắn), thiếu trường này thì
 * `isSavedArticle()` lọc bỏ khi đọc lại.
 */
function makeSavedArticleJson(id: number): PostDetail & { savedAt: string } {
  return { ...makeArticle(id), savedAt: '2026-08-01T00:00:00.000Z' };
}

const ACCOUNT_A = { provider: 'google' as const, displayName: 'Nguoi A', providerUserId: 'del-google-a' };
const ACCOUNT_B = { provider: 'google' as const, displayName: 'Nguoi B', providerUserId: 'del-google-b' };

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
});

describe('deleteAccount — HV3 (Task 284): xoá tài khoản chỉ xoá bài lưu của chính nó', () => {
  it('A xoá tài khoản → bài của A mất, khoá mã Apple cũ được dọn, B đăng nhập lại → bài của B còn nguyên', async () => {
    // --- A đăng nhập, lưu bài, mô phỏng App.tsx đồng bộ kho theo tài khoản A ---
    await accountStore.signIn(ACCOUNT_A);
    await savedArticlesStore.syncToAccount({ provider: ACCOUNT_A.provider, providerUserId: ACCOUNT_A.providerUserId });
    await savedArticlesStore.saveArticle(makeArticle(71));

    // --- B đã từng lưu bài từ trước, dữ liệu nằm sẵn trên đĩa dưới khoá RIÊNG của B ---
    const keyB = buildSavedArticlesStorageKey(ACCOUNT_B.provider, ACCOUNT_B.providerUserId);
    const rawDiskContentOfB = JSON.stringify({ 72: makeSavedArticleJson(72) });
    mockAsyncStorageMap.set(keyB, rawDiskContentOfB);

    // --- A xoá tài khoản ---
    await expect(deleteAccount()).resolves.toBeUndefined();

    // Khoá bài lưu CỦA A đã bị xoá khỏi đĩa.
    const keyA = buildSavedArticlesStorageKey(ACCOUNT_A.provider, ACCOUNT_A.providerUserId);
    expect(mockAsyncStorageMap.has(keyA)).toBe(false);

    // F4/DoD mục 3: khoá mã Apple cũ và bản ghi tài khoản đều được dọn (SecureStore).
    for (const entry of LOCAL_USER_DATA_KEYS) {
      if (entry.backend === 'secure-store') {
        await expect(SecureStore.getItemAsync(entry.key)).resolves.toBeNull();
      }
    }
    expect(accountStore.getState()).toEqual({ status: 'signed-out' });

    // Khoá bài lưu CỦA B hoàn toàn không bị đụng tới.
    expect(mockAsyncStorageMap.get(keyB)).toBe(rawDiskContentOfB);

    // --- App.tsx phản ứng với accountStore chuyển signed-out: quên RAM ---
    await savedArticlesStore.syncToAccount(null);
    expect(savedArticlesStore.getState()).toEqual({});

    // --- B đăng nhập ---
    await accountStore.signIn(ACCOUNT_B);
    await savedArticlesStore.syncToAccount({ provider: ACCOUNT_B.provider, providerUserId: ACCOUNT_B.providerUserId });

    expect(Object.keys(savedArticlesStore.getState())).toEqual(['72']);
    expect(savedArticlesStore.getState()).not.toHaveProperty('71');
  });
});
