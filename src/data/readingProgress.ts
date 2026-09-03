import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_PARTITION, buildPartitionStorageKey } from './localPartitions';

/**
 * BẢN GHI TRẠNG THÁI ĐỌC (Task 305, BLI 299 — `AD-21`/`AD-23`, xem
 * `tmp/cb-news/ad3-vong2-vuot-4-2-2.md` mục 2 dòng `AD-21`/`AD-23`).
 *
 * Ghi lại: mã bài, tiến độ đọc (0..1), thời điểm đọc gần nhất — dữ liệu NÓI VỀ CON NGƯỜI
 * (ai đã đọc gì, đọc tới đâu), nên PHẢI bị quét khi xoá tài khoản (`AD-23`,
 * `sweepOnAccountDeletion: true`, đăng ký ở `localUserData.ts`).
 *
 * Nằm ở PHÂN VÙNG THIẾT BỊ (`localPartitions.ts`, Task 301) — đọc/ghi được khi CHƯA đăng
 * nhập (`AD-19`/`AD-22`), vì khối "Đang đọc dở" ở home (task sau, `AD-21`) phải chạy đủ
 * nghĩa cả khi chưa đăng nhập.
 *
 * Lưu MỘT blob JSON duy nhất (không phải một khoá/bài) để `sweepOnAccountDeletion` xoá
 * được bằng đúng MỘT lệnh `AsyncStorage.removeItem()` — không dựng cơ chế lưu trữ thứ hai
 * (`F1`/`AD-19`).
 */

export const READING_PROGRESS_STORAGE_KEY = buildPartitionStorageKey(
  'cbnews.readingProgress.v1',
  DEVICE_PARTITION,
);

export type ReadingProgressEntry = {
  articleId: number;
  /** 0 (chưa đọc gì) .. 1 (đã đọc hết) — đơn vị do màn đọc bài (task sau) tự định nghĩa. */
  progress: number;
  /** ISO 8601 — lần cập nhật gần nhất. */
  lastReadAt: string;
};

type ReadingProgressState = Record<number, ReadingProgressEntry>;

function isReadingProgressEntry(value: unknown): value is ReadingProgressEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.articleId === 'number' && typeof v.progress === 'number' && typeof v.lastReadAt === 'string';
}

async function readState(): Promise<ReadingProgressState> {
  try {
    const raw = await AsyncStorage.getItem(READING_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const next: ReadingProgressState = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isReadingProgressEntry(value)) next[Number(key)] = value;
    }
    return next;
  } catch {
    return {};
  }
}

/** Đọc tiến độ của MỘT bài — `null` nếu chưa từng ghi. Chạy được khi CHƯA đăng nhập. */
export async function getReadingProgress(articleId: number): Promise<ReadingProgressEntry | null> {
  const state = await readState();
  return state[articleId] ?? null;
}

/** Đọc TOÀN BỘ bản ghi trạng thái đọc — dùng cho khối "Đang đọc dở" ở home (task sau). */
export async function getAllReadingProgress(): Promise<ReadingProgressEntry[]> {
  const state = await readState();
  return Object.values(state);
}

/**
 * Ghi tiến độ đọc của MỘT bài, tự đặt `lastReadAt` = thời điểm gọi hàm. Chạy được khi
 * CHƯA đăng nhập (phân vùng thiết bị, không cần định danh tài khoản nào).
 */
export async function setReadingProgress(articleId: number, progress: number): Promise<void> {
  const state = await readState();
  const next: ReadingProgressState = {
    ...state,
    [articleId]: { articleId, progress, lastReadAt: new Date().toISOString() },
  };
  await AsyncStorage.setItem(READING_PROGRESS_STORAGE_KEY, JSON.stringify(next));
}
