/// <reference types="jest" />
/**
 * Task 307 (BLI 299, `F4`/`AD-25`) — quyền thông báo KHÔNG được xin trước khi người dùng đã
 * đọc ít nhất một bài. Phép thử PHÂN ĐỊNH được: chưa đọc bài nào → không gọi
 * `ensureNotificationPermissionsAsync`; đã đọc một bài → có gọi — hai quan sát ngược chiều
 * trong CÙNG một bộ thử (DoD mục 6).
 *
 * `jest.fn()` tạo NGAY BÊN TRONG factory của `jest.mock()` (không tham chiếu biến ngoài),
 * đúng khuôn `notifications.test.ts` đã đặt — Babel hoist `import` lên trước mọi `const`.
 */

jest.mock('../../background/notifications', () => ({
  __esModule: true,
  ensureNotificationPermissionsAsync: jest.fn(),
}));

import * as notifications from '../../background/notifications';
import type { ReadingProgressEntry } from '../../data/readingProgress';
import { hasReadAtLeastOneArticle, maybeRequestNotificationPermissionAfterReading } from '../notificationTiming';

const mockEnsurePermissions = notifications.ensureNotificationPermissionsAsync as jest.Mock;

beforeEach(() => {
  mockEnsurePermissions.mockReset();
});

const oneEntry: ReadingProgressEntry[] = [{ articleId: 1, progress: 0.5, lastReadAt: '2026-09-03T00:00:00.000Z' }];

describe('hasReadAtLeastOneArticle', () => {
  it('mảng rỗng → false', () => {
    expect(hasReadAtLeastOneArticle([])).toBe(false);
  });

  it('có ít nhất một bản ghi → true', () => {
    expect(hasReadAtLeastOneArticle(oneEntry)).toBe(true);
  });
});

describe('maybeRequestNotificationPermissionAfterReading — hai quan sát ngược chiều', () => {
  it('CHƯA đọc bài nào (mở bài ĐẦU TIÊN của máy) → KHÔNG gọi ensureNotificationPermissionsAsync', async () => {
    await maybeRequestNotificationPermissionAfterReading([]);

    expect(mockEnsurePermissions).not.toHaveBeenCalled();
  });

  it('ĐÃ đọc một bài trước đó (đang mở bài thứ hai trở đi) → CÓ gọi ensureNotificationPermissionsAsync', async () => {
    await maybeRequestNotificationPermissionAfterReading(oneEntry);

    expect(mockEnsurePermissions).toHaveBeenCalledTimes(1);
  });
});
