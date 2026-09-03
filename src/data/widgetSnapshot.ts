import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PostSummary } from '../api/newsApi';
import { DEVICE_PARTITION, buildPartitionStorageKey } from './localPartitions';

/**
 * ẢNH CHỤP CHO WIDGET (Task 305, BLI 299 — `F3`/`AD-20`) — ĐƯỜNG NỐI MỎNG: task này chỉ
 * ghi payload xuống PHÂN VÙNG THIẾT BỊ bằng AsyncStorage; container App Group thật (đích
 * mà widget Swift đọc) là việc của task widget (chưa làm). Nhờ tách đúng MỘT hàm
 * `writeWidgetSnapshot()`, task widget sau chỉ cần đổi ĐÍCH GHI (App Group) mà KHÔNG phải
 * viết lại handler bốn việc của `AD-18`.
 *
 * CHỈ nội dung công cộng (`AD-20`) — cấm đưa bất cứ gì từ phân vùng tài khoản vào đây.
 * `sweepOnAccountDeletion: false` (`AD-23`, đăng ký ở `localUserData.ts`): xoá tài khoản
 * KHÔNG xoá ảnh chụp này, vì nó không tiết lộ gì về người dùng — quét nó chỉ làm widget
 * trống trơn mà không đổi được câu nào trên trang chính sách (xem mục 3 ghi chú `AD-23`
 * trong `ad3-vong2-vuot-4-2-2.md`).
 *
 * Đây là một PHÉP CHIẾU, không phải nguồn sự thật thứ hai (`AD-20`): xoá tệp này không
 * mất thông tin gì, lượt làm mới kế tiếp dựng lại đủ.
 */

export const WIDGET_SNAPSHOT_STORAGE_KEY = buildPartitionStorageKey('cbnews.widgetSnapshot.v1', DEVICE_PARTITION);

/** Số tiêu đề mới nhất giữ trong ảnh chụp — đủ cho khung widget nhỏ/vừa, không phải số đo. */
export const WIDGET_SNAPSHOT_ITEM_LIMIT = 5;

export type WidgetSnapshotItem = {
  id: number;
  titleHtml: string;
  date: string;
  imageUrl: string | null;
  /**
   * "Đường bấm sâu vào bài" (`F3`). Hiện dùng tạm URL công khai (`PostSummary.link`) vì
   * app CHƯA khai custom URL scheme để deep-link thẳng vào `ArticleScreen` — khai scheme
   * là việc chạm màn hình/điều hướng, ngoài phạm vi task này (rào "không sửa màn hình
   * nào"). Task widget cần đổi trường này thành URL nội bộ nếu muốn mở thẳng app thay vì
   * trình duyệt.
   */
  deepLink: string;
};

export type WidgetSnapshotPayload = {
  generatedAt: string;
  items: WidgetSnapshotItem[];
};

/** Đọc lại ảnh chụp hiện có — dùng cho phép thử và cho task widget sau khi nối App Group. */
export async function readWidgetSnapshot(): Promise<WidgetSnapshotPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as WidgetSnapshotPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Ghi ảnh chụp MỘT CHIỀU từ `posts` — app ghi, widget (task sau) chỉ đọc (`AD-20`).
 */
export async function writeWidgetSnapshot(posts: readonly PostSummary[]): Promise<void> {
  const payload: WidgetSnapshotPayload = {
    generatedAt: new Date().toISOString(),
    items: posts.slice(0, WIDGET_SNAPSHOT_ITEM_LIMIT).map((p) => ({
      id: p.id,
      titleHtml: p.titleHtml,
      date: p.date,
      imageUrl: p.imageUrl,
      deepLink: p.link,
    })),
  };
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_STORAGE_KEY, JSON.stringify(payload));
}
