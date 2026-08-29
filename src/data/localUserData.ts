import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCOUNT_STORAGE_KEY } from '../state/accountStore';
import { SAVED_ARTICLES_STORAGE_KEY } from './savedArticles';
import { APPLE_AUTH_CODE_STORAGE_KEY } from '../auth/appleAuth';

/**
 * MỌI khoá lưu trữ trên máy chứa dữ liệu người dùng của CB News.
 *
 * "Xoá tài khoản" (Apple Guideline 5.1.1(v)) phải xoá sạch từng khoá trong danh sách
 * này. Tính năng nào sau này lưu thêm dữ liệu người dùng trên máy (bài đọc offline ở
 * đợt 4 là ví dụ đầu tiên) PHẢI đăng ký khoá của mình vào đây thay vì tự viết đường
 * xoá riêng — một danh sách duy nhất, không rải rác nhiều nơi.
 *
 * Mở rộng Task 267 so với bản gốc (chỉ 1 khoá SecureStore của tài khoản): dữ liệu bài
 * lưu offline nằm ở AsyncStorage, không phải SecureStore (lý do: xem comment trong
 * `savedArticles.ts` — SecureStore có ngưỡng kích thước không phù hợp nội dung bài dài).
 * Mỗi mục vì vậy phải khai rõ `backend` để `clearAllLocalUserData()` xoá đúng chỗ; khai
 * sai backend là bug (khoá tưởng đã xoá nhưng vẫn còn dữ liệu — đúng bẫy brief cảnh báo).
 */
export type LocalUserDataBackend = 'secure-store' | 'async-storage';
export type LocalUserDataEntry = { key: string; backend: LocalUserDataBackend };

export const LOCAL_USER_DATA_KEYS: readonly LocalUserDataEntry[] = [
  { key: ACCOUNT_STORAGE_KEY, backend: 'secure-store' },
  { key: SAVED_ARTICLES_STORAGE_KEY, backend: 'async-storage' },
  // Task 274: mã uỷ quyền Apple (authorizationCode) giữ lại để gọi Worker thu hồi
  // token lúc xoá tài khoản — thiếu dòng này thì xoá tài khoản để sót mã lại trong
  // Keychain, vi phạm đúng cam kết "xoá sạch dữ liệu" app hiển thị cho người dùng.
  { key: APPLE_AUTH_CODE_STORAGE_KEY, backend: 'secure-store' },
];

/**
 * Xoá sạch mọi khoá đã đăng ký, đúng backend của từng khoá. Nguồn xoá tài khoản DUY NHẤT —
 * `deleteAccount.ts` gọi hàm này thay vì tự lặp `SecureStore.deleteItemAsync`.
 * Một khoá lỗi không chặn các khoá còn lại (best-effort, giống hành vi cũ).
 */
export async function clearAllLocalUserData(): Promise<void> {
  for (const entry of LOCAL_USER_DATA_KEYS) {
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
