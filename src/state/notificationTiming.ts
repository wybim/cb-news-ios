import type { ReadingProgressEntry } from '../data/readingProgress';
import { ensureNotificationPermissionsAsync } from '../background/notifications';

/**
 * THỜI ĐIỂM xin quyền thông báo (Task 307, BLI 299 — `F4`/`AD-25`). Nguyên văn phương án đã
 * loại trong `ad3-vong2-vuot-4-2-2.md`: "xin quyền thông báo ở màn đầu tiên cho chắc → chồng
 * thêm một hộp thoại hệ thống vào đúng chỗ người kiểm duyệt đã bỏ dở". Xin quyền CHỈ được
 * phép sau khi người dùng đã đọc ít nhất một bài.
 *
 * Bản ghi trạng thái đọc (`readingProgress.ts`, phân vùng THIẾT BỊ) là tín hiệu DUY NHẤT nói
 * "đã đọc bài nào chưa" mà không cần phiên đăng nhập (`AD-19`/`AD-22`).
 *
 * `priorEntries` PHẢI là bản ghi đọc được TRƯỚC lần mở bài hiện tại (trước khi
 * `ArticleScreen` ghi tiến độ của chính bài đang mở) — [INFER/ước lượng, brief không phân
 * định rõ]: chọn xin quyền từ LƯỢT MỞ BÀI THỨ HAI trở đi, không xin ngay trong lúc đang mở
 * bài ĐẦU TIÊN của máy — đây là cách đọc AN TOÀN hơn cho "sau khi đã đọc ít nhất một bài"
 * (đã đọc XONG một bài, không phải "đang đọc bài đầu tiên"). Xem comment giao hàng Task 307.
 *
 * `maybeRequestNotificationPermissionAfterReading` CHỈ GỌI `ensureNotificationPermissionsAsync`
 * (rào an toàn #5: không sửa logic của `notifications.ts`, chỉ gọi).
 */
export function hasReadAtLeastOneArticle(entries: readonly ReadingProgressEntry[]): boolean {
  return entries.length > 0;
}

export async function maybeRequestNotificationPermissionAfterReading(
  priorEntries: readonly ReadingProgressEntry[],
): Promise<void> {
  if (!hasReadAtLeastOneArticle(priorEntries)) return;
  await ensureNotificationPermissionsAsync();
}
