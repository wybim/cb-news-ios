import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PostSummary } from '../api/newsApi';
import { DEVICE_PARTITION, buildPartitionStorageKey } from './localPartitions';
import { inlineTextOnly } from '../utils/htmlParser';

/**
 * ẢNH CHỤP CHO WIDGET (Task 305 + Task 310, BLI 299 — `F3`/`AD-20`).
 *
 * Task 305 để lại ĐƯỜNG NỐI MỎNG: ghi payload xuống PHÂN VÙNG THIẾT BỊ bằng AsyncStorage
 * (đích cục bộ, dùng cho JS/phép thử). Task 310 nối tiếp CHÍNH hàm `writeWidgetSnapshot()`
 * này — không dựng đường ghi thứ hai — để cùng một payload cũng ĐI TỚI container App Group
 * thật mà widget Swift (`targets/widget/widget.swift`) đọc, qua `ExtensionStorage` của
 * `@bacons/apple-targets` (native module ghi `UserDefaults(suiteName:)` của App Group).
 *
 * CHỈ nội dung công cộng (`AD-20`) — cấm đưa bất cứ gì từ phân vùng tài khoản vào đây. Hàm
 * này CHỈ nhận `posts: PostSummary[]` (danh sách công khai từ `newsApi`) làm đầu vào — không
 * import `savedArticles`/`accountStore` — nên KHÔNG có cách nào bài thuộc phân vùng tài
 * khoản lọt vào payload (phép thử phân định: `__tests__/widgetSnapshot.test.ts`).
 *
 * `sweepOnAccountDeletion: false` (`AD-23`, đăng ký ở `localUserData.ts`): xoá tài khoản
 * KHÔNG xoá ảnh chụp này (cả bản AsyncStorage lẫn bản App Group — App Group không nằm
 * trong cơ chế quét `LOCAL_USER_DATA_KEYS`, và đó là ĐÚNG ý `AD-23`: nó không tiết lộ gì về
 * người dùng, quét nó chỉ làm widget trống trơn mà không đổi được câu nào trên trang chính
 * sách, xem mục 3 ghi chú `AD-23` trong `ad3-vong2-vuot-4-2-2.md`).
 *
 * Đây là một PHÉP CHIẾU, không phải nguồn sự thật thứ hai (`AD-20`): xoá tệp này (cục bộ
 * hoặc App Group) không mất thông tin gì, lượt làm mới kế tiếp dựng lại đủ.
 *
 * App KHÔNG tự lên lịch làm mới nền riêng cho widget (`F5`/`AD-18`) — mỗi lần ghi xong đều
 * gọi `ExtensionStorage.reloadWidget()` để xin WidgetKit làm mới NGAY bằng cơ chế của chính
 * hệ thống, cộng với `Timeline`/`.atEnd` phía Swift tự xin làm mới định kỳ — không có lượt
 * chạy nền thứ hai nào được dựng thêm.
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

/**
 * App Group ĐÍCH GHI thật (Task 310). PHẢI khớp nguyên văn `WIDGET_APP_GROUP_ID` ở
 * `app.config.js` và `com.apple.security.application-groups` ở
 * `targets/widget/expo-target.config.js` — ba chỗ, một giá trị, không đồng bộ tự động.
 */
export const WIDGET_APP_GROUP_ID = 'group.com.cbcentres.cbnews';

/** PHẢI khớp nguyên văn `snapshotStorageKey` trong `targets/widget/widget.swift`. */
export const WIDGET_APP_GROUP_SNAPSHOT_KEY = 'cbnews.widgetSnapshot.appGroup.v1';

/**
 * Khuôn dữ liệu phía App Group — KHÁC `WidgetSnapshotItem` đúng một trường: `title` là chữ
 * THƯỜNG (đã bóc HTML bằng `inlineTextOnly`, cùng hàm `notifications.ts` đang dùng cho body
 * thông báo), không phải `titleHtml`. Swift không tự parse HTML nên phải bóc ở phía JS.
 */
export type WidgetAppGroupItem = {
  id: number;
  title: string;
  date: string;
  imageUrl: string | null;
  deepLink: string;
};

export type WidgetAppGroupPayload = {
  generatedAt: string;
  items: WidgetAppGroupItem[];
};

function toAppGroupPayload(payload: WidgetSnapshotPayload): WidgetAppGroupPayload {
  return {
    generatedAt: payload.generatedAt,
    items: payload.items.map((item) => ({
      id: item.id,
      title: inlineTextOnly(item.titleHtml),
      date: item.date,
      imageUrl: item.imageUrl,
      deepLink: item.deepLink,
    })),
  };
}

/** Đọc lại ảnh chụp CỤC BỘ hiện có (bản AsyncStorage, không phải bản App Group) — dùng cho
 *  phép thử và cho mọi tính năng JS sau này cần đọc lại ảnh chụp vừa ghi. */
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

/** Nạp `@bacons/apple-targets` MUỘN — xem lý do trong khối chú thích trên `writeWidgetSnapshot`. */
function requireExtensionStorageModule(): typeof import('@bacons/apple-targets') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@bacons/apple-targets');
}

/**
 * Ghi ảnh chụp MỘT CHIỀU từ `posts` — app ghi, widget chỉ đọc (`AD-20`). Ghi CẢ HAI đích
 * bằng đúng một payload nguồn: bản cục bộ (AsyncStorage, Task 305) và bản App Group thật
 * (Task 310, đích widget Swift đọc). `ExtensionStorage.set()` dùng đường `setString` với một
 * chuỗi JSON tự `JSON.stringify` — KHÔNG dùng `setObject`/`setArray` của gói (chỉ nhận
 * `Record<string, string | number>` phẳng, không nhận `imageUrl: string | null`); phía Swift
 * đọc lại bằng `UserDefaults.string(forKey:)` rồi `JSONDecoder` (xem `widget.swift`).
 *
 * `ExtensionStorage` (từ `@bacons/apple-targets`) tự KHÔNG NÉM LỖI khi native module chưa
 * được liên kết (Expo Go, hoặc app chưa qua `expo prebuild`) — mã nguồn gói tự rơi về hàm
 * rỗng trong trường hợp đó (đã đọc mã nguồn `ExtensionStorage.ts` của gói). Không cần bọc
 * thêm try/catch quanh việc GỌI nó.
 *
 * NẠP MUỘN bằng `require()` bên trong hàm (`requireExtensionStorageModule()`) thay vì
 * `import` tĩnh ở đầu file — ĐO ĐƯỢC THẬT, không phải suy diễn:
 * `node_modules/@bacons/apple-targets/build/ExtensionStorage.js` đọc biến toàn cục `expo`
 * NGAY khi module được nạp (dòng đầu file, ngoài mọi hàm), và biến đó chỉ tồn tại ở runtime
 * Expo/React Native thật — KHÔNG tồn tại trong Node/Jest. Trước khi đổi sang nạp muộn,
 * `import` tĩnh ở đầu file này làm MỌI module chỉ cần đọc một hằng số xuất từ đây
 * (`localUserData.ts` đọc `WIDGET_SNAPSHOT_STORAGE_KEY`) cũng sập theo —
 * `ReferenceError: expo is not defined` — kéo theo 4 bộ test vốn không đụng gì tới widget
 * (`localUserData.test.ts` + 3 `deleteAccount.*.test.ts`) đỏ ngay ở bước import, trước khi
 * chạy bất kỳ test nào (`npm test` đã đo trước/sau khi đổi để xác nhận). Thử `import()` động
 * trước — cũng tránh được lỗi trên — nhưng để lại cảnh báo "worker process has failed to
 * exit gracefully" mới toanh (đo được, so với baseline sạch trước khi đổi); `require()` nạp
 * muộn không để lại cảnh báo đó, và đúng với thứ Metro/Babel đã dịch MỌI `import` tĩnh khác
 * trong repo xuống thành (RN không có bundle-splitting `import()` nào khác trong codebase để
 * đối chiếu), nên đây là lựa chọn ít giả định hơn.
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

  const { ExtensionStorage } = requireExtensionStorageModule();
  const appGroupStorage = new ExtensionStorage(WIDGET_APP_GROUP_ID);
  appGroupStorage.set(WIDGET_APP_GROUP_SNAPSHOT_KEY, JSON.stringify(toAppGroupPayload(payload)));
  ExtensionStorage.reloadWidget();
}
