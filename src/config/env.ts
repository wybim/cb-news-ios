import Constants from 'expo-constants';

/**
 * Đọc cấu hình đăng nhập từ `extra` của app.config.js (đã nạp `process.env` lúc build).
 * Thiếu biến môi trường thật → trả về undefined/false, KHÔNG throw — nơi gọi phải tự
 * hiện thông báo "cấu hình chưa sẵn sàng" thay vì để app sập (Task 263, đợt 3a).
 */
function readExtraString(key: string): string | undefined {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Biến môi trường thật cần cấu hình: GOOGLE_IOS_CLIENT_ID (xem .env.example). */
export const googleIosClientId = readExtraString('googleIosClientId');

export function isGoogleSignInConfigured(): boolean {
  return Boolean(googleIosClientId);
}
