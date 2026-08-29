import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { PostDetail } from '../api/newsApi';

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
 * Khoá `SAVED_ARTICLES_STORAGE_KEY` đã đăng ký vào `LOCAL_USER_DATA_KEYS`
 * (`src/data/localUserData.ts`) — xoá tài khoản phải xoá sạch bài đã lưu.
 */

export const SAVED_ARTICLES_STORAGE_KEY = 'cbnews.savedArticles.v1';

export type SavedArticle = PostDetail & {
  /** ISO 8601 — lúc người dùng bấm lưu, dùng để sắp xếp tab "Đã lưu". */
  savedAt: string;
};

type SavedArticlesState = Record<number, SavedArticle>;

let state: SavedArticlesState = {};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function isSavedArticle(value: unknown): value is SavedArticle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.contentHtml === 'string' && typeof v.savedAt === 'string';
}

async function persist(next: SavedArticlesState): Promise<void> {
  await AsyncStorage.setItem(SAVED_ARTICLES_STORAGE_KEY, JSON.stringify(next));
}

/** Đọc AsyncStorage đúng một lần lúc app khởi động, gọi lại nhiều lần vẫn an toàn. */
async function hydrate(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      let next: SavedArticlesState = {};
      try {
        const raw = await AsyncStorage.getItem(SAVED_ARTICLES_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
              if (isSavedArticle(value)) next[Number(key)] = value;
            }
          }
        }
      } catch {
        next = {};
      }
      state = next;
      hydrated = true;
      emit();
    })();
  }
  return hydratePromise;
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
  hydrate,
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
