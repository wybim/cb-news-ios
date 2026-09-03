import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCOUNT_STORAGE_KEY, type AccountProvider } from '../state/accountStore';
import { buildSavedArticlesStorageKey } from './savedArticles';
import { APPLE_AUTH_CODE_STORAGE_KEY } from '../auth/appleAuth';

/**
 * MỌI khoá lưu trữ trên máy chứa dữ liệu người dùng của CB News.
 *
 * "Xoá tài khoản" (Apple Guideline 5.1.1(v)) phải xoá sạch từng khoá liên quan tới tài
 * khoản đang bị xoá. Tính năng nào sau này lưu thêm dữ liệu người dùng trên máy PHẢI đăng
 * ký khoá của mình vào đây thay vì tự viết đường xoá riêng — một nguồn xoá duy nhất
 * (`clearAllLocalUserData()`), không rải rác nhiều nơi.
 *
 * `LOCAL_USER_DATA_KEYS` dưới đây chỉ liệt kê khoá KHÔNG đổi theo tài khoản (đúng một bản
 * ghi tài khoản đang đăng nhập, đúng một mã uỷ quyền Apple cũ cần dọn). Bài lưu đọc offline
 * (Task 267, tách theo tài khoản ở Task 284) không nằm trong danh sách tĩnh này nữa — mỗi
 * tài khoản có một khoá riêng (`buildSavedArticlesStorageKey`, xem `savedArticles.ts`), nên
 * `clearAllLocalUserData()` nhận thêm tài khoản đang bị xoá để tính đúng khoá cần dọn.
 *
 * Mở rộng Task 267 so với bản gốc (chỉ 1 khoá SecureStore của tài khoản): dữ liệu bài
 * lưu offline nằm ở AsyncStorage, không phải SecureStore (lý do: xem comment trong
 * `savedArticles.ts` — SecureStore có ngưỡng kích thước không phù hợp nội dung bài dài).
 * Mỗi mục vì vậy phải khai rõ `backend` để `clearAllLocalUserData()` xoá đúng chỗ; khai
 * sai backend là bug (khoá tưởng đã xoá nhưng vẫn còn dữ liệu — đúng bẫy brief cảnh báo).
 *
 * Task 301 (`AD-23`): kho cục bộ tách thành phân vùng THIẾT BỊ + phân vùng TÀI KHOẢN
 * (`localPartitions.ts`), và phân vùng thiết bị chứa CẢ HAI loại dữ liệu — loại nói về
 * CON NGƯỜI (phải bị quét khi xoá tài khoản, vd bản ghi trạng thái đọc, mốc đã-đọc) và loại
 * là bản sao nội dung công cộng (KHÔNG bị quét, vd cache bài, ảnh chụp widget, mốc đồng-bộ
 * lần cuối). Việc này KHÔNG suy ra được từ tên phân vùng, nên mỗi khoá phải tự khai cờ
 * `sweepOnAccountDeletion`. Task 301 chỉ dựng cơ chế phân loại — KHÔNG đăng ký khoá thiết bị
 * nào ở đây (đó là dữ liệu của các task sau); hai khoá tĩnh hiện có giữ `true`, đúng hành vi
 * cũ (chúng luôn bị quét).
 */
export type LocalUserDataBackend = 'secure-store' | 'async-storage';
export type LocalUserDataEntry = {
  key: string;
  backend: LocalUserDataBackend;
  /** `true`: khoá này nói về CON NGƯỜI (ai đã làm gì) — BỊ QUÉT khi xoá tài khoản.
   *  `false`: khoá này là bản sao nội dung công cộng/phi danh tính — KHÔNG bị quét, dù nằm
   *  trong phân vùng thiết bị. Không suy ra được từ tên phân vùng (`AD-23`) — mỗi khoá phải
   *  tự khai. */
  sweepOnAccountDeletion: boolean;
};

export const LOCAL_USER_DATA_KEYS: readonly LocalUserDataEntry[] = [
  { key: ACCOUNT_STORAGE_KEY, backend: 'secure-store', sweepOnAccountDeletion: true },
  // Task 274/278: mã uỷ quyền Apple (authorizationCode) KHÔNG còn được ghi lúc đăng nhập
  // hay đọc lúc xoá tài khoản từ Task 278 (xem `appleAuth.ts`) — hằng số này giờ chỉ còn
  // tác dụng DỌN khoá cũ còn sót trên máy đã cài bản trước Task 278. Sửa lại chú thích cho
  // đúng hiện trạng (F5, Task 284 — bản trước ghi nhầm "giữ lại để gọi Worker thu hồi
  // token", QC Task 282 đã bắt được).
  { key: APPLE_AUTH_CODE_STORAGE_KEY, backend: 'secure-store', sweepOnAccountDeletion: true },
];

/**
 * Xoá đúng những khoá trong `entries` có `sweepOnAccountDeletion: true`, theo backend của
 * từng khoá — khoá khai `false` được BỎ QUA có chủ đích (`AD-23`). Tách khỏi
 * `clearAllLocalUserData()` để phép thử gọi được trực tiếp với một danh sách tổng hợp
 * (không phải `LOCAL_USER_DATA_KEYS` thật), chứng minh cơ chế phân loại PHÂN ĐỊNH được:
 * trong cùng một lượt gọi, khoá khai `true` mất, khoá khai `false` còn — hai quan sát ngược
 * chiều, không phải một tiêu chí luôn đạt.
 */
export async function sweepLocalUserDataEntries(entries: readonly LocalUserDataEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!entry.sweepOnAccountDeletion) continue;
    try {
      if (entry.backend === 'secure-store') {
        await SecureStore.deleteItemAsync(entry.key);
      } else {
        await AsyncStorage.removeItem(entry.key);
      }
    } catch {
      // tiếp tục xoá các khoá còn lại dù một khoá lỗi
    }
  }
}

/**
 * Xoá sạch mọi khoá đã đăng ký trong `LOCAL_USER_DATA_KEYS` có cờ `sweepOnAccountDeletion:
 * true` (hôm nay là cả hai khoá tĩnh — hành vi không đổi so với trước Task 301), CỘNG khoá
 * bài lưu offline của `account` (nếu có tài khoản đang bị xoá — `null` khi không xác định
 * được, ví dụ đã đăng xuất trước đó). Khoá bài lưu của phân vùng TÀI KHOẢN luôn bị quét vô
 * điều kiện — nó không cần cờ vì bản thân phân vùng tài khoản CHỈ giữ dữ liệu về con người
 * (`AD-19`). Nguồn xoá tài khoản DUY NHẤT — `deleteAccount.ts` gọi hàm này thay vì tự lặp
 * `SecureStore.deleteItemAsync`/`AsyncStorage.removeItem`. Một khoá lỗi không chặn các khoá
 * còn lại (best-effort, giống hành vi cũ).
 */
export async function clearAllLocalUserData(
  account: { provider: AccountProvider; providerUserId: string } | null,
): Promise<void> {
  await sweepLocalUserDataEntries(LOCAL_USER_DATA_KEYS);
  if (account) {
    try {
      await AsyncStorage.removeItem(buildSavedArticlesStorageKey(account.provider, account.providerUserId));
    } catch {
      // best-effort, giống các khoá khác ở trên
    }
  }
}
