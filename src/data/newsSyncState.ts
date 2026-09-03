import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_PARTITION, buildPartitionStorageKey } from './localPartitions';

/**
 * Trạng thái đồng bộ tin tức của MÁY (Task 305, BLI 299 — `AD-17`/`AD-18`).
 *
 * HAI khoá TÁCH RIÊNG dù cùng vòng đời đọc/ghi trong `newsRefreshCycle.ts`, vì `AD-23`
 * phân loại xoá KHÁC NHAU (đăng ký ở `localUserData.ts`):
 * - `lastKnownArticleMarker` ("mốc đã-đọc", `AD-17`) — bài mới nhất mà máy ĐÃ THÔNG BÁO
 *   (Task 314, BLI 299, `DoD 4`: mốc chỉ tiến khi một thông báo đã THẬT SỰ được lên lịch —
 *   xem `newsRefreshCycle.ts:detectNewArticlesAndSchedule`), dùng để so sánh phát hiện "có
 *   bài mới cần báo tiếp". Đây là dữ liệu NÓI VỀ CON NGƯỜI (máy này đã báo tin tới đâu) →
 *   PHẢI bị quét khi xoá tài khoản (`sweepOnAccountDeletion: true`).
 * - `lastSyncedAt` ("mốc đồng-bộ lần cuối") — chỉ ghi lại THỜI ĐIỂM lượt chạy nền/tiền
 *   cảnh gần nhất đã chạy xong tới hết việc ③ (`AD-18`) — không tiết lộ gì về người dùng
 *   → KHÔNG bị quét (`sweepOnAccountDeletion: false`).
 */

export const LAST_KNOWN_ARTICLE_MARKER_STORAGE_KEY = buildPartitionStorageKey(
  'cbnews.lastKnownArticleMarker.v1',
  DEVICE_PARTITION,
);

export const LAST_SYNCED_AT_STORAGE_KEY = buildPartitionStorageKey('cbnews.lastSyncedAt.v1', DEVICE_PARTITION);

export type LastKnownArticleMarker = { id: number; date: string };

function isMarker(value: unknown): value is LastKnownArticleMarker {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.date === 'string';
}

/**
 * `null` nghĩa là máy này CHƯA TỪNG lên lịch một thông báo "có bài chưa đọc" nào thành
 * công (Task 314, `DoD 4`) — có thể vì chưa từng chạy lượt làm mới nào, HOẶC đã chạy nhiều
 * lượt nhưng chưa lần nào lên lịch được (chưa có quyền thông báo).
 */
export async function getLastKnownArticleMarker(): Promise<LastKnownArticleMarker | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KNOWN_ARTICLE_MARKER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMarker(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setLastKnownArticleMarker(marker: LastKnownArticleMarker): Promise<void> {
  await AsyncStorage.setItem(LAST_KNOWN_ARTICLE_MARKER_STORAGE_KEY, JSON.stringify(marker));
}

/** `null` nghĩa là chưa lượt làm mới nào từng chạy xong tới việc ③. */
export async function getLastSyncedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNCED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setLastSyncedAt(isoTimestamp: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNCED_AT_STORAGE_KEY, isoTimestamp);
}
