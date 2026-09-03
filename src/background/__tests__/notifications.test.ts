/// <reference types="jest" />
/**
 * Task 305 (BLI 299, AD-16) — RÀO CỨNG NHẤT: module `notifications.ts` chỉ được gọi bốn
 * hàm cục bộ của `expo-notifications`. Bài kiểm này mock CẢ HAI hàm lấy push token
 * (`getExpoPushTokenAsync`, `getDevicePushTokenAsync`) và khẳng định chúng KHÔNG BAO GIỜ
 * được gọi trong bất cứ nhánh nào — kiểm THẬT bằng runtime, không chỉ bằng `grep` tĩnh
 * (grep tĩnh chạy riêng ở bước giao hàng, xem comment giao hàng Task 305).
 *
 * `notifications.ts` gọi `Notifications.setNotificationHandler(...)` ngay lúc nạp module
 * (side effect ở phạm vi module) — nên các `jest.fn()` phải được tạo NGAY BÊN TRONG factory
 * của `jest.mock()` (không tham chiếu biến ngoài), rồi lấy lại tham chiếu qua `import *`
 * SAU khi mock đã có hiệu lực. Tham chiếu biến ngoài (`const mockX = jest.fn()` rồi dùng
 * trong factory) gây `ReferenceError` lúc chạy thật, vì Babel hoist `import` lên trước MỌI
 * statement khác trong file — kể cả `const` đứng trước nó trong mã nguồn.
 */

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  // Cố ý CÓ MẶT trong mock để bài kiểm chứng minh được rằng module thật KHÔNG gọi tới
  // chúng — nếu chỉ thiếu định nghĩa trong mock thì mọi lời gọi vô tình cũng "trôi qua".
  getExpoPushTokenAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import {
  ensureNotificationPermissionsAsync,
  hasNotificationPermissionAsync,
  scheduleNewArticleNotification,
} from '../notifications';

const mockSetNotificationHandler = Notifications.setNotificationHandler as jest.Mock;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
const mockGetExpoPushTokenAsync = (Notifications as unknown as Record<string, jest.Mock>).getExpoPushTokenAsync;
const mockGetDevicePushTokenAsync = (Notifications as unknown as Record<string, jest.Mock>).getDevicePushTokenAsync;

beforeEach(() => {
  mockGetPermissionsAsync.mockReset();
  mockRequestPermissionsAsync.mockReset();
  mockScheduleNotificationAsync.mockReset();
  mockGetExpoPushTokenAsync.mockReset();
  mockGetDevicePushTokenAsync.mockReset();
});

afterEach(() => {
  // Chốt chặn cho MỌI bài kiểm trong file này: không nhánh nào được gọi hàm lấy push
  // token, kể cả gián tiếp qua một đường không ai ngờ tới.
  expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
});

describe('notifications — setNotificationHandler được gọi lúc nạp module', () => {
  it('setNotificationHandler đã được gọi đúng một lần', () => {
    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
  });
});

// Task 308 (BLI 299, đóng lỗ AD-25): hai quan sát ngược chiều PHẢI cùng đứng trong file này.
// (1) đường ĐỌC BÀI — ensureNotificationPermissionsAsync là cơ chế XIN quyền duy nhất mà
// `notificationTiming.ts` gọi tới (nó chỉ delegate thẳng, không thêm logic); ba ca dưới đây
// khẳng định nó CÓ gọi requestPermissionsAsync khi chưa có quyền và còn hỏi lại được.
describe('ensureNotificationPermissionsAsync (cơ chế XIN quyền — đường đọc bài gọi tới)', () => {
  it('đã có quyền (granted=true) → trả true, KHÔNG gọi requestPermissionsAsync', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });

    expect(await ensureNotificationPermissionsAsync()).toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền nhưng canAskAgain → CÓ gọi requestPermissionsAsync và trả kết quả đó', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ granted: true });

    expect(await ensureNotificationPermissionsAsync()).toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('đã bị từ chối vĩnh viễn (canAskAgain=false) → trả false, KHÔNG hỏi lại', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });

    expect(await ensureNotificationPermissionsAsync()).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('hasNotificationPermissionAsync (cơ chế KIỂM quyền — đường lên lịch gọi tới)', () => {
  it('có quyền → trả true, KHÔNG gọi requestPermissionsAsync', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });

    expect(await hasNotificationPermissionAsync()).toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền nhưng canAskAgain=true → vẫn trả false, KHÔNG gọi requestPermissionsAsync', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });

    expect(await hasNotificationPermissionAsync()).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });
});

// (2) đường LÊN LỊCH — quan sát ngược chiều với describe phía trên: dù canAskAgain=true
// (tức trường hợp ensureNotificationPermissionsAsync SẼ xin), scheduleNewArticleNotification
// vẫn không được bật hộp thoại nào.
describe('scheduleNewArticleNotification (đường lên lịch — chỉ KIỂM, không XIN, Task 308)', () => {
  it('có quyền → gọi scheduleNotificationAsync với trigger:null, trả true, KHÔNG gọi requestPermissionsAsync', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    mockScheduleNotificationAsync.mockResolvedValueOnce('id-1');

    const ok = await scheduleNewArticleNotification(1, { titleHtml: '<p>Bài <strong>mới</strong></p>' });

    expect(ok).toBe(true);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger).toBeNull();
    expect(call.content.body).toBe('Bài mới'); // HTML đã được bóc bằng inlineTextOnly, không phải regex thô
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền, dù canAskAgain=true → trả false, KHÔNG xin quyền, KHÔNG lên lịch (đóng lỗ AD-25)', async () => {
    // canAskAgain:true CỐ Ý — đây là ca mà hành vi CŨ (ensureNotificationPermissionsAsync)
    // sẽ bật hộp thoại xin quyền; hành vi MỚI của đường lên lịch phải im lặng bỏ qua.
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });

    const ok = await scheduleNewArticleNotification(1, { titleHtml: '<p>Bài mới</p>' });

    expect(ok).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('đã bị từ chối vĩnh viễn (canAskAgain=false) → trả false, KHÔNG gọi scheduleNotificationAsync', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });

    const ok = await scheduleNewArticleNotification(1, { titleHtml: '<p>Bài mới</p>' });

    expect(ok).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('scheduleNotificationAsync ném lỗi → không throw ra ngoài, trả false', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('lỗi hệ thống thông báo'));

    await expect(scheduleNewArticleNotification(1, { titleHtml: '<p>x</p>' })).resolves.toBe(false);
  });
});
