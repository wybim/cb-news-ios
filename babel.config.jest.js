// Cấu hình Babel CHỈ dùng cho Jest (Task 274) — tách khỏi bundler production (Metro/Expo
// dùng babel-preset-expo riêng, không đụng ở đây). Mục đích duy nhất: strip TypeScript
// để chạy logic thuần trong Node khi test, KHÔNG build ra bản app thật.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
};
