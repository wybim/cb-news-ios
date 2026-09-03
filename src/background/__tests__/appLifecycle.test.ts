/// <reference types="jest" />
/**
 * Task 305 (BLI 299, AD-25) — đường TIỀN CẢNH của bộ lên lịch thông báo phải tồn tại ĐỘC
 * LẬP với lượt chạy nền: `createForegroundRefreshHandler()` phải gọi lại chu trình khi app
 * chuyển sang 'active', và KHÔNG gọi ở các trạng thái khác.
 */

import { createForegroundRefreshHandler } from '../appLifecycle';

describe('createForegroundRefreshHandler — AD-25 đường tiền cảnh', () => {
  it('nextState "active" → gọi runCycle', () => {
    const runCycle = jest.fn().mockResolvedValue(undefined);
    const handler = createForegroundRefreshHandler(runCycle);

    handler('active');

    expect(runCycle).toHaveBeenCalledTimes(1);
  });

  it('các trạng thái khác ("background", "inactive", "unknown") KHÔNG gọi runCycle', () => {
    const runCycle = jest.fn().mockResolvedValue(undefined);
    const handler = createForegroundRefreshHandler(runCycle);

    handler('background');
    handler('inactive');
    handler('unknown');

    expect(runCycle).not.toHaveBeenCalled();
  });

  it('runCycle reject không throw ra ngoài handler (đồng bộ, không được làm app crash)', () => {
    const runCycle = jest.fn().mockRejectedValue(new Error('mất mạng'));
    const handler = createForegroundRefreshHandler(runCycle);

    expect(() => handler('active')).not.toThrow();
  });
});
