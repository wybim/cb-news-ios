/// <reference types="jest" />
/**
 * Task 305 (BLI 299, AD-18) — ĐÚNG MỘT lượt chạy nền, ĐÚNG MỘT task identifier, và task đó
 * phải gọi thẳng `runNewsRefreshCycle()` (module dùng CHUNG với đường tiền cảnh — xem
 * `appLifecycle.test.ts`), không tự viết logic bốn việc riêng ở đây.
 *
 * Task 306 (BLI 299, AD-18): đổi mock từ `expo-background-task` (chế độ `processing` —
 * đúng phương án `AD-18` đã loại) sang `expo-background-fetch` (chế độ `fetch`), theo
 * đúng đổi đường đăng ký ở `backgroundTask.ts`. Năm kịch bản kiểm giữ nguyên, chỉ đổi
 * tên module/enum cho khớp API thật.
 *
 * `TaskManager.defineTask()` chạy NGAY lúc import module (phạm vi module, bắt buộc theo
 * tài liệu Expo) — nên các `jest.fn()` phải được tạo NGAY BÊN TRONG factory của
 * `jest.mock()` (không tham chiếu biến ngoài) rồi lấy lại tham chiếu qua `import *` SAU khi
 * mock đã có hiệu lực (xem ghi chú tương tự ở `notifications.test.ts` — Babel hoist `import`
 * lên trước MỌI statement khác, kể cả `const` đứng trước nó trong mã nguồn, nên tham chiếu
 * biến ngoài trong factory gây `ReferenceError` khi module dưới test gọi hàm mock NGAY lúc
 * nạp).
 */

jest.mock('expo-task-manager', () => ({
  __esModule: true,
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-fetch', () => ({
  __esModule: true,
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
  registerTaskAsync: jest.fn(),
}));

jest.mock('../newsRefreshCycle', () => ({
  __esModule: true,
  runNewsRefreshCycle: jest.fn(),
}));

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { runNewsRefreshCycle } from '../newsRefreshCycle';
import { NEWS_BACKGROUND_TASK_IDENTIFIER, registerNewsBackgroundTaskAsync } from '../backgroundTask';

const mockDefineTask = TaskManager.defineTask as jest.Mock;
const mockIsTaskRegisteredAsync = TaskManager.isTaskRegisteredAsync as jest.Mock;
const mockRegisterTaskAsync = BackgroundFetch.registerTaskAsync as jest.Mock;
const mockRunNewsRefreshCycle = runNewsRefreshCycle as jest.Mock;

beforeEach(() => {
  mockIsTaskRegisteredAsync.mockReset();
  mockRegisterTaskAsync.mockReset();
  mockRunNewsRefreshCycle.mockReset();
});

describe('backgroundTask — ĐÚNG MỘT task identifier, gọi thẳng runNewsRefreshCycle (AD-18)', () => {
  it('defineTask được gọi đúng MỘT lần, với đúng NEWS_BACKGROUND_TASK_IDENTIFIER', () => {
    expect(mockDefineTask).toHaveBeenCalledTimes(1);
    expect(mockDefineTask.mock.calls[0][0]).toBe(NEWS_BACKGROUND_TASK_IDENTIFIER);
  });

  it('callback của task gọi runNewsRefreshCycle() và trả NewData khi thành công', async () => {
    mockRunNewsRefreshCycle.mockResolvedValueOnce({ ok: true });
    const taskExecutor = mockDefineTask.mock.calls[0][1] as () => Promise<unknown>;

    const result = await taskExecutor();

    expect(mockRunNewsRefreshCycle).toHaveBeenCalled();
    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
  });

  it('callback trả Failed khi runNewsRefreshCycle ném lỗi (không để lượt nền crash)', async () => {
    mockRunNewsRefreshCycle.mockRejectedValueOnce(new Error('mất mạng'));
    const taskExecutor = mockDefineTask.mock.calls[0][1] as () => Promise<unknown>;

    const result = await taskExecutor();

    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.Failed);
  });

  it('registerNewsBackgroundTaskAsync KHÔNG đăng ký lại nếu task đã đăng ký rồi', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValueOnce(true);

    await registerNewsBackgroundTaskAsync();

    expect(mockRegisterTaskAsync).not.toHaveBeenCalled();
  });

  it('registerNewsBackgroundTaskAsync đăng ký với ĐÚNG task identifier nếu chưa đăng ký', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValueOnce(false);

    await registerNewsBackgroundTaskAsync();

    expect(mockRegisterTaskAsync).toHaveBeenCalledWith(NEWS_BACKGROUND_TASK_IDENTIFIER);
  });
});
