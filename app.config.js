// Cấu hình động (app.config.js) thay cho app.json tĩnh, vì cần đọc biến môi trường
// lúc build để cắm placeholder khi chưa có cấu hình Google thật (Task 263, đợt 3a).
//
// GOOGLE_IOS_CLIENT_ID: OAuth client ID loại iOS, tạo trên Google Cloud Console cho
// đúng bundle "com.cbcentres.cbnews". KHÔNG phải bí mật (client ID loại iOS không có
// client secret) nên được phép nằm trong "extra" — phần này lộ ra trong JS bundle đã
// build, đúng như cách Google Sign-In SDK vẫn dùng client ID phía app từ trước giờ.
// Thiếu biến này thì app vẫn build và chạy được, chỉ riêng nút đăng nhập Google bị
// khoá + hiện thông báo "cấu hình chưa sẵn sàng" (xem src/config/env.ts).
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID ?? '';

// Gói @react-native-google-signin/google-signin (bản không dùng Firebase) BẮT BUỘC
// một "iosUrlScheme" hợp lệ dạng "com.googleusercontent.apps.<id>" ngay tại thời điểm
// prebuild, nếu không plugin ném lỗi và cả app không build được — kể cả khi chưa có
// client ID thật. Bình thường giá trị này là chuỗi client ID đảo ngược; khi có client
// ID thật thì suy ra tự động, khi chưa có thì trả về một placeholder hợp lệ về mặt
// hình thức (không phải giá trị thật của ai) để prebuild không sập.
function deriveGoogleIosUrlScheme(clientId) {
  const suffix = '.apps.googleusercontent.com';
  if (clientId && clientId.endsWith(suffix)) {
    return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
  }
  return 'com.googleusercontent.apps.giu-cho-chua-cau-hinh';
}

module.exports = {
  expo: {
    name: 'CB News',
    slug: 'cb-news',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.cbcentres.cbnews',
      // Task 268 (đợt 5a): app chỉ gọi HTTPS tiêu chuẩn (TLS có sẵn của hệ điều hành,
      // không tự cài thuật toán mã hoá riêng) nên khai "không dùng mã hoá phải khai báo
      // xuất khẩu" ngay trong app.config.js. Thiếu khai báo này thì bản build đứng chờ
      // App Store Connect hỏi thủ công, treo cả round TestFlight. Trường đúng chuẩn Expo
      // v57 cho việc này là "ios.config.usesNonExemptEncryption" — Expo tự đặt
      // ITSAppUsesNonExemptEncryption trong Info.plist, nguồn:
      // docs.expo.dev/versions/v57.0.0/config/app/ (mục ios.config.usesNonExemptEncryption).
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    // Đọc lại ở runtime qua expo-constants (src/config/env.ts). Chỉ chứa client ID
    // công khai, không chứa bất kỳ khoá bí mật nào.
    extra: {
      googleIosClientId: GOOGLE_IOS_CLIENT_ID,
    },
    plugins: [
      // Bật entitlement Sign in with Apple tự động lúc prebuild (không cần cấu hình
      // thêm gì — Apple không cấp "client ID" phía app cho native Sign in with Apple,
      // chỉ cần bật capability "Sign In with Apple" trên App ID phía Apple Developer
      // portal, việc đó chủ dự án đang làm, ngoài phạm vi mã nguồn).
      'expo-apple-authentication',
      [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: deriveGoogleIosUrlScheme(GOOGLE_IOS_CLIENT_ID) },
      ],
    ],
  },
};
