import { ACCOUNT_STORAGE_KEY } from '../state/accountStore';

/**
 * MỌI khoá SecureStore chứa dữ liệu người dùng của CB News.
 *
 * "Xoá tài khoản" (Apple Guideline 5.1.1(v)) phải xoá sạch từng khoá trong danh sách
 * này. Tính năng nào sau này lưu thêm dữ liệu người dùng trên máy (ví dụ bài đọc
 * offline ở đợt 4) PHẢI đăng ký khoá của mình vào đây thay vì tự viết đường xoá riêng
 * — một danh sách duy nhất, không rải rác nhiều nơi.
 */
export const LOCAL_USER_DATA_KEYS: readonly string[] = [ACCOUNT_STORAGE_KEY];
