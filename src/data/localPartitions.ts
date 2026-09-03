import type { AccountProvider } from '../state/accountStore';

/**
 * Cơ chế PHÂN VÙNG dùng chung cho kho dữ liệu cục bộ (Task 301, BLI 299 — nền của vòng 2,
 * `AD-19`/`AD-22`/`AD-23` ở `tmp/cb-news/ad3-vong2-vuot-4-2-2.md`).
 *
 * Kho cục bộ tách thành HAI PHÂN VÙNG, dùng chung ĐÚNG MỘT khuôn khoá `(provider,
 * providerUserId)` mà Task 284 đã đặt cho bài lưu offline (`savedArticles.ts`) — KHÔNG dựng
 * cơ chế lưu trữ thứ hai (`F1`/`AD-19`; xem `kb/lessons/2026-08-30-chon-xong-de-yen-trong-ho-so.md`):
 *
 * - **Phân vùng THIẾT BỊ** (`DEVICE_PARTITION`) — vô danh, MẶC ĐỊNH, đọc/ghi được khi CHƯA
 *   đăng nhập. `provider` là giá trị canh riêng `'local'` (`F3`), `providerUserId` cố định
 *   `'device'` vì một máy chỉ có đúng một phân vùng thiết bị.
 * - **Phân vùng TÀI KHOẢN** — lớp phủ, chỉ tồn tại khi đã đăng nhập, dùng `(provider,
 *   providerUserId)` THẬT của tài khoản (`accountStore.AccountProvider` — `'apple' |
 *   'google'`, không đổi bởi task này).
 *
 * `AccountProvider` (nhà cung cấp ĐĂNG NHẬP thật) và giá trị `'local'` (phân vùng thiết bị,
 * KHÔNG phải một nhà cung cấp đăng nhập) là hai khái niệm khác nhau — quyết định `F3` của
 * task này là TÁCH MỘT KIỂU RIÊNG (`StoragePartitionIdentity`) cho khoá kho thay vì mở rộng
 * `AccountProvider` thành `'apple' | 'google' | 'local'`. Lý do: `AccountProvider` còn được
 * dùng để rẽ nhánh luồng đăng nhập/đăng xuất/thu hồi token thật (Apple/Google) — mở rộng nó
 * để chấp một giá trị "không phải nhà cung cấp nào" sẽ buộc mọi chỗ switch/if trên
 * `AccountProvider` phải xử lý thêm một nhánh vô nghĩa với chúng. Tách riêng giữ hai khái
 * niệm KHÔNG lẫn nhau mà vẫn dùng chung một khuôn khoá.
 *
 * Module này chỉ định nghĩa CÁCH ĐẶT TÊN khoá và ĐỊNH DANH phân vùng — không tự giữ dữ liệu,
 * không thay AsyncStorage/SecureStore. Tính năng nào cần đọc/ghi phân vùng nào thì tự gọi
 * AsyncStorage (hoặc SecureStore, tuỳ độ nhạy cảm — xem lý do chọn backend trong
 * `savedArticles.ts`) với khoá do `buildPartitionStorageKey()` trả về, đúng cách
 * `savedArticles.ts` đã làm từ Task 284. Task 301 KHÔNG tạo bất cứ loại dữ liệu thiết bị nào
 * (cache bài, mốc đã-đọc, mốc đồng-bộ, ảnh chụp widget, bản ghi trạng thái đọc) — những task
 * sau tự đăng ký khoá của mình bằng cơ chế này.
 */

/** Giá trị `provider` riêng cho phân vùng thiết bị — một giá trị canh trong CÙNG khuôn khoá
 *  `(provider, providerUserId)`, KHÔNG phải một nhà cung cấp đăng nhập (`F3`). */
export const DEVICE_PARTITION_PROVIDER = 'local' as const;

/** Định danh một phân vùng lưu trữ — cùng hình dạng cho cả hai loại phân vùng, để tái dùng
 *  đúng một hàm dựng khoá (`buildPartitionStorageKey`). */
export type StoragePartitionIdentity = {
  provider: AccountProvider | typeof DEVICE_PARTITION_PROVIDER;
  providerUserId: string;
};

/**
 * Định danh CỐ ĐỊNH của phân vùng thiết bị. Hằng số, không phải hàm — một thiết bị có đúng
 * MỘT phân vùng thiết bị, không cần phiên đăng nhập để mở nó (`AD-19`, `AD-22`). Mọi tính
 * năng chạy được khi CHƯA đăng nhập (widget, thông báo cục bộ, cache offline, các khối
 * home không gắn danh tính) dùng chung định danh này.
 */
export const DEVICE_PARTITION: StoragePartitionIdentity = {
  provider: DEVICE_PARTITION_PROVIDER,
  providerUserId: 'device',
};

export function isDevicePartition(partition: StoragePartitionIdentity): boolean {
  return partition.provider === DEVICE_PARTITION_PROVIDER;
}

/**
 * Dựng định danh phân vùng TÀI KHOẢN từ tài khoản đang đăng nhập — lớp phủ, chỉ tồn tại khi
 * có phiên đăng nhập thật (`provider` ở đây luôn là `AccountProvider` thật, không bao giờ
 * là `'local'`).
 */
export function accountPartition(account: {
  provider: AccountProvider;
  providerUserId: string;
}): StoragePartitionIdentity {
  return { provider: account.provider, providerUserId: account.providerUserId };
}

/**
 * Dựng khoá lưu trữ cho MỘT tính năng ở MỘT phân vùng — đúng khuôn Task 284 đã đặt:
 * `<tiền tố tính năng>.<provider>:<providerUserId>`. Mọi tính năng (bài lưu, và sau này
 * cache/mốc đã-đọc/ảnh chụp widget/bản ghi trạng thái đọc) dùng chung đúng một hàm này để
 * đặt tên khoá — không dựng cơ chế lưu trữ thứ hai (`F1`).
 */
export function buildPartitionStorageKey(featureKeyPrefix: string, partition: StoragePartitionIdentity): string {
  return `${featureKeyPrefix}.${partition.provider}:${partition.providerUserId}`;
}
