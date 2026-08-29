// Task 274 (BLI 258): repo chưa từng có test framework nào trước bản vá này. Thêm cấu
// hình Jest TỐI THIỂU — chỉ đủ để chạy test logic thuần (không cần simulator/thiết bị
// thật, máy KB không có Xcode) — nhằm chứng minh bằng bài kiểm THẬT thay vì suy diễn:
// "lỗi gọi Worker thu hồi token Apple không được chặn việc xoá dữ liệu tại chỗ"
// (xem src/auth/__tests__/deleteAccount.worker-failure.test.ts).
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { configFile: require.resolve('./babel.config.jest.js') }],
  },
};
