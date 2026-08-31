/// <reference types="jest" />
/**
 * Task 284 (BLI 258) — tách kho bài lưu đọc offline theo tài khoản. Trước bản vá này,
 * `savedArticlesStore` nạp AsyncStorage đúng MỘT LẦN vào biến mức module (`state`,
 * `hydrated`, `hydratePromise`) rồi giữ suốt vòng đời app — tài khoản sau thấy bài của
 * tài khoản trước cho tới khi tắt hẳn app.
 *
 * Bài kiểm này đo THẲNG `savedArticlesStore` thật (không mock chính module đang sửa) —
 * chỉ mock native module `@react-native-async-storage/async-storage` bằng một Map trong
 * bộ nhớ. Mọi phép thử đổi tài khoản chạy TRONG CÙNG một tiến trình Jest, không
 * `jest.resetModules()` — đúng tinh thần "đo trong cùng một phiên chạy, không phải chỉ
 * sau khi khởi động lại app" mà brief Task 284 yêu cầu, và đúng bẫy
 * kb/lessons/2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md cảnh báo (kiểm sau
 * khi restart thì bỏ sót đúng lỗi này).
 *
 * Mỗi tài khoản dùng `providerUserId` DUY NHẤT cho riêng file này để không lẫn dữ liệu
 * giữa các `it()` (module là một singleton sống suốt file, không tự dọn giữa các test).
 */

// Biến "mock*" — theo đúng quy tắc babel-plugin-jest-hoist đã dùng trong
// deleteAccount.*.test.ts (jest.mock bị hoist lên trên khai báo const thường).
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
  savedArticlesStore,
  buildSavedArticlesStorageKey,
  SAVED_ARTICLES_STORAGE_KEY_PREFIX,
  type ActiveSavedArticlesAccount,
} from '../savedArticles';
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
 * `isSavedArticle()` lọc bỏ khi đọc lại, làm bài kiểm tưởng nhầm là "không có gì để đọc".
 */
function makeSavedArticleJson(id: number): PostDetail & { savedAt: string } {
  return { ...makeArticle(id), savedAt: '2026-08-01T00:00:00.000Z' };
}

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
});

describe('savedArticlesStore — F6: dọn khoá dùng chung cũ đúng một lần (Task 284)', () => {
  it('xoá khoá phẳng cũ khi lần đầu đồng bộ, và KHÔNG xoá/đọc lại ở các lần sau', async () => {
    mockAsyncStorageMap.set(SAVED_ARTICLES_STORAGE_KEY_PREFIX, JSON.stringify({ 1: makeArticle(1) }));

    const accountX: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'legacy-test-x' };
    const accountY: ActiveSavedArticlesAccount = { provider: 'google', providerUserId: 'legacy-test-y' };

    await savedArticlesStore.syncToAccount(accountX);
    expect(mockAsyncStorageMap.has(SAVED_ARTICLES_STORAGE_KEY_PREFIX)).toBe(false);

    // Gọi thêm hai lượt đồng bộ nữa (mô phỏng nhiều lần đổi tài khoản) — việc dọn khoá cũ
    // không được lặp lại.
    await savedArticlesStore.syncToAccount(null);
    await savedArticlesStore.syncToAccount(accountY);

    const removeItemMock = AsyncStorage.removeItem as jest.Mock;
    const legacyRemovalCalls = removeItemMock.mock.calls.filter(
      ([key]) => key === SAVED_ARTICLES_STORAGE_KEY_PREFIX,
    );
    expect(legacyRemovalCalls).toHaveLength(1);
  });
});

describe('savedArticlesStore — bốn hành vi bắt buộc sau khi tách theo tài khoản (Task 284)', () => {
  it('HV1: A lưu bài → đăng xuất → B đăng nhập → B thấy danh sách rỗng', async () => {
    const accountA: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'hv1-apple-a' };
    const accountB: ActiveSavedArticlesAccount = { provider: 'google', providerUserId: 'hv1-google-b' };

    await savedArticlesStore.syncToAccount(accountA);
    await savedArticlesStore.saveArticle(makeArticle(11));
    expect(savedArticlesStore.getState()).toHaveProperty('11');

    await savedArticlesStore.syncToAccount(null); // đăng xuất
    await savedArticlesStore.syncToAccount(accountB); // B đăng nhập

    expect(savedArticlesStore.getState()).toEqual({});
  });

  it('HV2: B lưu bài của B → đăng xuất → A đăng nhập lại → A thấy đúng bài của A, không thấy bài của B', async () => {
    const accountA: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'hv2-apple-a' };
    const accountB: ActiveSavedArticlesAccount = { provider: 'google', providerUserId: 'hv2-google-b' };

    await savedArticlesStore.syncToAccount(accountA);
    await savedArticlesStore.saveArticle(makeArticle(21));
    await savedArticlesStore.syncToAccount(null);

    await savedArticlesStore.syncToAccount(accountB);
    await savedArticlesStore.saveArticle(makeArticle(22));
    await savedArticlesStore.syncToAccount(null);

    await savedArticlesStore.syncToAccount(accountA);
    expect(Object.keys(savedArticlesStore.getState())).toEqual(['21']);
    expect(savedArticlesStore.getState()).not.toHaveProperty('22');
  });

  it('HV4: A đăng xuất rồi đăng nhập lại → bài của A vẫn còn (đăng xuất KHÔNG xoá bài lưu)', async () => {
    const accountA: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'hv4-apple-a' };

    await savedArticlesStore.syncToAccount(accountA);
    await savedArticlesStore.saveArticle(makeArticle(41));

    await savedArticlesStore.syncToAccount(null); // đăng xuất — F2: không được xoá bài lưu
    expect(savedArticlesStore.getState()).toEqual({}); // RAM quên, nhưng đĩa còn (kiểm ngay dưới)

    await savedArticlesStore.syncToAccount(accountA); // đăng nhập lại đúng tài khoản cũ
    expect(savedArticlesStore.getState()).toHaveProperty('41');
  });
});

describe('savedArticlesStore — bắt lỗi TRONG CÙNG một phiên chạy, không chỉ sau khi khởi động lại (Task 284)', () => {
  it('quên state NGAY LẬP TỨC khi đổi tài khoản, trước cả khi đọc xong khoá mới từ đĩa', async () => {
    const accountA: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'race-apple-a' };
    const accountB: ActiveSavedArticlesAccount = { provider: 'google', providerUserId: 'race-google-b' };

    await savedArticlesStore.syncToAccount(accountA);
    await savedArticlesStore.saveArticle(makeArticle(51));
    expect(savedArticlesStore.getState()).toHaveProperty('51');

    const switchPromise = savedArticlesStore.syncToAccount(accountB);
    // Đo NGAY sau lời gọi, TRƯỚC khi await — đây đúng là điểm bản cũ (hydrate một lần) sẽ
    // sai: nếu chỉ kiểm sau khi khởi động lại app thì bỏ sót đúng khoảnh khắc này.
    expect(savedArticlesStore.getState()).toEqual({});

    await switchPromise;
    expect(savedArticlesStore.getState()).toEqual({});
  });

  it('đổi tài khoản dồn dập (A rồi B ngay lập tức, không đợi A đọc xong) — kết quả cuối đúng là B', async () => {
    const accountA: ActiveSavedArticlesAccount = { provider: 'apple', providerUserId: 'race2-apple-a' };
    const accountB: ActiveSavedArticlesAccount = { provider: 'google', providerUserId: 'race2-google-b' };

    mockAsyncStorageMap.set(
      buildSavedArticlesStorageKey(accountA.provider, accountA.providerUserId),
      JSON.stringify({ 61: makeSavedArticleJson(61) }),
    );
    mockAsyncStorageMap.set(
      buildSavedArticlesStorageKey(accountB.provider, accountB.providerUserId),
      JSON.stringify({ 62: makeSavedArticleJson(62) }),
    );
    await savedArticlesStore.syncToAccount(null); // xuất phát từ trạng thái trung tính

    // Ép lượt đọc đĩa của A TRẢ LỜI TRỄ HƠN lượt đọc của B — mô phỏng disk I/O không đảm
    // bảo thứ tự hoàn tất theo đúng thứ tự gọi. Dùng một object làm "hộp chứa" resolver
    // thay vì biến `let` trần — tránh TypeScript hẹp kiểu (narrow) nhầm về `never` khi biến
    // bị gán lại bên trong closure của `new Promise`.
    const pendingReadOfA: { resolve: (() => void) | null } = { resolve: null };
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      (key: string) =>
        new Promise<string | null>((resolve) => {
          pendingReadOfA.resolve = () => resolve(mockAsyncStorageMap.get(key) ?? null);
        }),
    );

    const syncA = savedArticlesStore.syncToAccount(accountA);
    const syncB = savedArticlesStore.syncToAccount(accountB); // gọi ngay, không đợi A xong

    await syncB;
    expect(Object.keys(savedArticlesStore.getState())).toEqual(['62']);

    pendingReadOfA.resolve?.(); // giờ mới cho A "đọc xong" — TRỄ hơn B, phải bị bộ đếm lượt bỏ qua
    await syncA;

    expect(Object.keys(savedArticlesStore.getState())).toEqual(['62']); // vẫn là B, không bị A ghi đè
  });
});
