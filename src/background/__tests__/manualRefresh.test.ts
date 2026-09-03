/// <reference types="jest" />
/**
 * Task 307 (BLI 299, `F5`/`AD-18`) — nút làm mới thủ công phải gọi ĐÚNG MỘT chu trình đã có,
 * KHÔNG dựng chu trình thứ hai. Mock `newsRefreshCycle` để đếm số lần gọi thẳng vào chu
 * trình DUY NHẤT, đúng khuôn `newsRefreshCycle.order.test.ts` (factory tự chứa jest.fn()).
 */

const mockRunNewsRefreshCycle = jest.fn();
jest.mock('../newsRefreshCycle', () => ({
  __esModule: true,
  runNewsRefreshCycle: (...args: unknown[]) => mockRunNewsRefreshCycle(...args),
}));

import { triggerManualRefresh } from '../manualRefresh';

beforeEach(() => {
  mockRunNewsRefreshCycle.mockReset();
});

describe('triggerManualRefresh — gọi đúng một chu trình đã có', () => {
  it('gọi runNewsRefreshCycle ĐÚNG MỘT LẦN, không tham số lạ', async () => {
    mockRunNewsRefreshCycle.mockResolvedValueOnce({
      ok: true,
      newArticlesDetected: false,
      notificationScheduled: false,
      widgetSnapshotWritten: true,
      offlineCache: { attempted: 0, cached: 0, failed: 0 },
    });

    await triggerManualRefresh();

    expect(mockRunNewsRefreshCycle).toHaveBeenCalledTimes(1);
    expect(mockRunNewsRefreshCycle).toHaveBeenCalledWith();
  });

  it('trả lại đúng kết quả của runNewsRefreshCycle (pass-through, không biến đổi)', async () => {
    const result = {
      ok: true,
      newArticlesDetected: true,
      notificationScheduled: true,
      widgetSnapshotWritten: true,
      offlineCache: { attempted: 3, cached: 3, failed: 0 },
    };
    mockRunNewsRefreshCycle.mockResolvedValueOnce(result);

    await expect(triggerManualRefresh()).resolves.toBe(result);
  });

  it('gọi nhiều lần liên tiếp → mỗi lần đúng một lượt gọi runNewsRefreshCycle, không tự nhân đôi', async () => {
    mockRunNewsRefreshCycle.mockResolvedValue({
      ok: true,
      newArticlesDetected: false,
      notificationScheduled: false,
      widgetSnapshotWritten: false,
      offlineCache: { attempted: 0, cached: 0, failed: 0 },
    });

    await triggerManualRefresh();
    await triggerManualRefresh();

    expect(mockRunNewsRefreshCycle).toHaveBeenCalledTimes(2);
  });
});
