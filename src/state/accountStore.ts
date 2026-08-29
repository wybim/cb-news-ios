import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * Lớp trạng thái tài khoản — MỘT NGUỒN SỰ THẬT DUY NHẤT (Task 263, đợt 3a).
 *
 * Bài học kb/lessons/2026-08-25-hai-nguon-cung-su-that-khong-dong-bo.md: không dựng
 * hai thứ cùng mô tả một sự thật rồi để chúng lệch nhau. Ở đây SecureStore (Keychain
 * trên iOS) là nguồn bền vững duy nhất; biến `state` trong RAM chỉ là bản cache
 * ghi-qua (write-through) — MỌI thay đổi ghi xuống SecureStore xong mới cập nhật cache
 * và báo listener. Không màn hình nào được giữ biến trạng thái đăng nhập riêng của nó;
 * mọi nơi đọc trạng thái phải qua `useAccountState()` hoặc `accountStore.getState()`.
 */

export const ACCOUNT_STORAGE_KEY = 'cbnews.account.v1';

export type AccountProvider = 'apple' | 'google';

export type SignedInAccount = {
  status: 'signed-in';
  provider: AccountProvider;
  displayName: string;
  providerUserId: string;
};

export type AccountState =
  | { status: 'unknown' } // chưa hydrate xong từ SecureStore lúc app khởi động
  | { status: 'signed-out' }
  | SignedInAccount;

type Listener = () => void;

let state: AccountState = { status: 'unknown' };
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(next: AccountState): void {
  state = next;
  emit();
}

function isSignedInAccount(value: unknown): value is SignedInAccount {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.status === 'signed-in' &&
    (v.provider === 'apple' || v.provider === 'google') &&
    typeof v.displayName === 'string' &&
    typeof v.providerUserId === 'string'
  );
}

/** Đọc SecureStore đúng một lần lúc app khởi động, gọi lại nhiều lần vẫn an toàn. */
async function hydrate(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(ACCOUNT_STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (!stored) {
        setState({ status: 'signed-out' });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stored);
        setState(isSignedInAccount(parsed) ? parsed : { status: 'signed-out' });
      } catch {
        setState({ status: 'signed-out' });
      }
    })();
  }
  return hydratePromise;
}

async function signIn(account: Omit<SignedInAccount, 'status'>): Promise<void> {
  const next: SignedInAccount = { status: 'signed-in', ...account };
  await SecureStore.setItemAsync(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
  setState(next);
}

/** Xoá đúng bản ghi tài khoản. Dùng cho cả "đăng xuất" và bước cuối của "xoá tài khoản". */
async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_STORAGE_KEY);
  setState({ status: 'signed-out' });
}

function getState(): AccountState {
  return state;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const accountStore = {
  getState,
  subscribe,
  hydrate,
  signIn,
  signOut,
};

/** Hook duy nhất để đọc trạng thái tài khoản trong UI — không tự giữ state song song. */
export function useAccountState(): AccountState {
  return useSyncExternalStore(subscribe, getState);
}
