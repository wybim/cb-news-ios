import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { PostDetail } from '../api/newsApi';
import type { AccountProvider } from '../state/accountStore';

/**
 * Lớp trạng thái "bài đã lưu để đọc offline" — MỘT NGUỒN SỰ THẬT DUY NHẤT, cùng khuôn với
 * `accountStore.ts` (kb/lessons/2026-08-25-hai-nguon-cung-su-that-khong-dong-bo.md): AsyncStorage
 * là nguồn bền vững, biến `state` trong RAM chỉ là bản cache ghi-qua.
 *
 * Vì sao AsyncStorage chứ không phải SecureStore như accountStore: nội dung bài
 * (`content.rendered`) có thể vài KB–vài chục KB, trong khi SecureStore (Keychain) có ngưỡng
 * lịch sử ~2048 byte mỗi giá trị và có thể ném lỗi native khi vượt (docs.expo.dev/versions/
 * v57.0.0/sdk/securestore, đo lại Task 267) — không phù hợp lưu nội dung bài. Dữ liệu này
 * cũng không nhạy cảm (tin công khai của cbcentres.com) nên không cần mã hoá Keychain.
 *
 * Task 284: TÁCH KHO THEO TÀI KHOẢN. Trước bản vá này có đúng MỘT khoá dùng chung cho cả
 * máy (`cbnews.savedArticles.v1`) — tài khoản sau thấy bài của tài khoản trước, xoá một
 * tài khoản xoá sạch bài của mọi tài khoản. Khoá bây giờ mang định danh tài khoản
 * (`buildSavedArticlesStorageKey`), và `LOCAL_USER_DATA_KEYS` (`src/data/localUserData.ts`)
 * không còn khai khoá này tĩnh — `clearAllLocalUserData()` tính khoá của tài khoản đang bị
 * xoá tại chỗ gọi.
 */

/** Khoá CŨ dùng chung mọi tài khoản (trước Task 284) — chỉ dùng để DỌN MỘT LẦN (F6), không
 *  còn đọc/ghi bình thường qua khoá này nữa. */
const LEGACY_SHARED_STORAGE_KEY = 'cbnews.savedArticles.v1';
/** Cờ bền đánh dấu đã dọn xong khoá cũ — tránh việc dọn chạy lại mỗi lần khởi động (F6). */
const LEGACY_CLEANUP_DONE_KEY = 'cbnews.savedArticles.legacyCleanupDone.v1';

/** Tiền tố khoá mới — hậu tố `.<provider>:<providerUserId>` do `buildSavedArticlesStorageKey` gắn. */
export const SAVED_ARTICLES_STORAGE_KEY_PREFIX = LEGACY_SHARED_STORAGE_KEY;

/**
 * Khoá bài lưu offline của MỘT tài khoản. Dùng cặp (`provider`, `providerUserId`) từ
 * `accountStore` làm định danh — KHÔNG dùng tên hiển thị/email vì hai giá trị đó đổi được
 * và có thể rỗng (F1, brief Task 284).
 */
export function buildSavedArticlesStorageKey(provider: AccountProvider, providerUserId: string): string {
  return `${SAVED_ARTICLES_STORAGE_KEY_PREFIX}.${provider}:${providerUserId}`;
}

export type SavedArticle = PostDetail & {
  /** ISO 8601 — lúc người dùng bấm lưu, dùng để sắp xếp tab "Đã lưu". */
  savedAt: string;
};

/** Định danh tài khoản đang active đối với kho này — `null` nghĩa là chưa có ai đăng nhập. */
export type ActiveSavedArticlesAccount = { provider: AccountProvider; providerUserId: string };

type SavedArticlesState = Record<number, SavedArticle>;

let state: SavedArticlesState = {};
let hydrated = false;
/** Tài khoản mà `state` hiện đang phản ánh — dùng để `persist()` ghi đúng khoá và để
 *  `syncToAccount()` biết có cần nạp lại hay không. */
let activeAccount: ActiveSavedArticlesAccount | null = null;
/** Bộ đếm lượt đồng bộ — đổi tài khoản dồn dập thì kết quả đọc đĩa TRỄ của lượt cũ phải bị
 *  bỏ, không được ghi đè lên state của lượt mới hơn. */
let syncGeneration = 0;
let legacyCleanupPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function sameAccount(a: ActiveSavedArticlesAccount | null, b: ActiveSavedArticlesAccount | null): boolean {
  if (a === null || b === null) return a === b;
  return a.provider === b.provider && a.providerUserId === b.providerUserId;
}

function isSavedArticle(value: unknown): value is SavedArticle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.contentHtml === 'string' && typeof v.savedAt === 'string';
}

async function persist(next: SavedArticlesState): Promise<void> {
  // Không có tài khoản active thì không có khoá nào để ghi — im lặng bỏ qua (phòng thủ;
  // UI thật chỉ gọi saveArticle/removeArticle khi đã đăng nhập, xem HomeScreen/App.tsx).
  if (!activeAccount) return;
  const key = buildSavedArticlesStorageKey(activeAccount.provider, activeAccount.providerUserId);
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

/**
 * Dọn khoá dùng chung cũ (F6, Task 284) — CHỈ MỘT LẦN mỗi máy, không chạy lại mỗi lần khởi
 * động (cờ `LEGACY_CLEANUP_DONE_KEY`). Bài cũ trộn lẫn mọi tài khoản, không gán được cho ai
 * mà không đoán — đoán chính là lỗi đang sửa; PM đã chốt xoá hẳn, chấp nhận cái giá nhỏ (tin
 * công khai của cbcentres.com, lưu lại mất hai lần chạm, demo chỉ có một người dùng thật).
 */
function purgeLegacySharedStorageOnce(): Promise<void> {
  if (!legacyCleanupPromise) {
    legacyCleanupPromise = (async () => {
      try {
        const done = await AsyncStorage.getItem(LEGACY_CLEANUP_DONE_KEY);
        if (done) return;
        await AsyncStorage.removeItem(LEGACY_SHARED_STORAGE_KEY);
        await AsyncStorage.setItem(LEGACY_CLEANUP_DONE_KEY, '1');
      } catch {
        // best-effort — lỗi dọn khoá cũ không được chặn luồng nạp bài theo tài khoản.
      }
    })();
  }
  return legacyCleanupPromise;
}

/**
 * CHỖ KHÓ NHẤT của Task 284 — thay cho `hydrate()` một-lần-duy-nhất của bản cũ (Task 267).
 * Gọi lại hàm này MỖI KHI tài khoản đổi (đăng xuất, đăng nhập tài khoản khác), không chỉ
 * một lần lúc app khởi động — `App.tsx` gọi theo từng lượt đổi của `useAccountState()`.
 *
 * `account: null` nghĩa là hiện KHÔNG có ai đăng nhập (vừa đăng xuất, hoặc app vừa mở chưa
 * đăng nhập) — chỉ xoá RAM, không đọc đĩa (không có định danh để chọn khoá).
 *
 * Bảo đảm KHÔNG có cửa sổ "vẫn thấy bài người trước" trong CÙNG một phiên chạy: `state`
 * được xoá VỀ RỖNG và bắn `emit()` NGAY LẬP TỨC (đồng bộ, trước khi `await` bất cứ gì) mỗi
 * khi tài khoản đổi — UI không bao giờ render dữ liệu của tài khoản cũ trong lúc đang chờ
 * đọc khoá mới từ đĩa. Đây đúng là phần phép thử phải bắt được (kb/lessons/2026-08-29-
 * phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md): kiểm sau khi khởi động lại app là đo
 * nhầm đối tượng, phải đo NGAY trong phiên đang chạy.
 */
async function syncToAccount(account: ActiveSavedArticlesAccount | null): Promise<void> {
  void purgeLegacySharedStorageOnce();

  if (sameAccount(activeAccount, account) && hydrated) {
    return; // đã nạp đúng tài khoản này rồi — tránh đọc đĩa lại vô ích mỗi lần accountStore emit.
  }

  const myGeneration = ++syncGeneration;
  hydrated = false;
  state = {};
  emit();

  if (!account) {
    activeAccount = null;
    hydrated = true;
    emit();
    return;
  }

  const key = buildSavedArticlesStorageKey(account.provider, account.providerUserId);
  let next: SavedArticlesState = {};
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [rawKey, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (isSavedArticle(value)) next[Number(rawKey)] = value;
        }
      }
    }
  } catch {
    next = {};
  }

  // Một lượt đồng bộ khác đã chen ngang trong lúc đang đọc đĩa (đổi tài khoản dồn dập) —
  // bỏ kết quả TRỄ này, đừng ghi đè lên state của lượt mới hơn.
  if (myGeneration !== syncGeneration) return;

  state = next;
  activeAccount = account;
  hydrated = true;
  emit();
}

function getState(): SavedArticlesState {
  return state;
}

function isHydrated(): boolean {
  return hydrated;
}

function isSaved(id: number): boolean {
  return id in state;
}

async function saveArticle(article: PostDetail): Promise<void> {
  const next: SavedArticlesState = { ...state, [article.id]: { ...article, savedAt: new Date().toISOString() } };
  await persist(next);
  state = next;
  emit();
}

async function removeArticle(id: number): Promise<void> {
  if (!(id in state)) return;
  const next = { ...state };
  delete next[id];
  await persist(next);
  state = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const savedArticlesStore = {
  syncToAccount,
  getState,
  isHydrated,
  isSaved,
  saveArticle,
  removeArticle,
  subscribe,
};

/** Hook duy nhất để đọc danh sách bài đã lưu trong UI. */
export function useSavedArticles(): SavedArticlesState {
  return useSyncExternalStore(subscribe, getState);
}
