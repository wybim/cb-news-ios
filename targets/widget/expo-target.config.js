// Task 310 (BLI 299, AD-20) — cấu hình target widget cho `@bacons/apple-targets`.
//
// KHÔNG đặt `deploymentTarget` (mặc định 18.0 của chính plugin) — extension được PHÉP có
// deployment target cao hơn app chính (Apple: "an app extension's deployment target must be
// the same as or later than its containing app's"), nên giữ mặc định là an toàn và không
// đoán số của riêng app chính.
//
// `entitlements` khai TƯỜNG MINH theo đúng ví dụ trong README chính thức (không dựa vào cơ
// chế tự đồng bộ "appGroupsByDefault" của plugin khi `entitlements` bị bỏ trống — mã nguồn
// plugin, `src/with-widget.ts`, chỉ chạy nhánh tự đồng bộ App Group NẾU object
// `entitlements` đã tồn tại; để trống hẳn thì bỏ qua toàn bộ nhánh đó). Giá trị PHẢI khớp
// nguyên văn `WIDGET_APP_GROUP_ID` ở `app.config.js` và `src/data/widgetSnapshot.ts`.
module.exports = (config) => ({
  type: 'widget',
  name: 'CBNewsWidget',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
