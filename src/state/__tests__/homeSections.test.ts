/// <reference types="jest" />
/**
 * Task 307 (BLI 299, `AD-21`) — home nhiều khối: ba khối đúng thứ tự, khối ① vắng khi chưa
 * đọc bài nào, khối ② hiển thị tử tế khi chưa có mốc đồng-bộ. KHÔNG import `accountStore`
 * một lần nào trong file này — cả ba khối phải chạy đủ nghĩa khi CHƯA đăng nhập (`F3`),
 * đúng khuôn `readingProgress.test.ts`/`localPartitions.test.ts` đã đặt.
 */

import type { ReadingProgressEntry } from '../../data/readingProgress';
import { buildHomeSections, formatSyncTime, selectContinueReadingEntry } from '../homeSections';

function entry(articleId: number, lastReadAt: string, progress = 0.5): ReadingProgressEntry {
  return { articleId, progress, lastReadAt };
}

describe('selectContinueReadingEntry', () => {
  it('không có bản ghi nào → null (chưa đọc bài nào)', () => {
    expect(selectContinueReadingEntry([])).toBeNull();
  });

  it('nhiều bản ghi → chọn đúng bản ghi có lastReadAt MỚI NHẤT, không phải bản ghi đầu/cuối mảng', () => {
    const oldest = entry(1, '2026-09-01T00:00:00.000Z');
    const newest = entry(2, '2026-09-03T10:00:00.000Z');
    const middle = entry(3, '2026-09-02T00:00:00.000Z');

    expect(selectContinueReadingEntry([oldest, newest, middle])).toBe(newest);
    // Đảo thứ tự mảng — kết quả không phụ thuộc vị trí trong mảng.
    expect(selectContinueReadingEntry([newest, oldest, middle])).toBe(newest);
  });
});

describe('buildHomeSections — thứ tự cố định theo AD-21', () => {
  it('có bản ghi đang đọc dở → 3 khối, đúng thứ tự continueReading → offlineReady → latest', () => {
    const continueReadingEntry = entry(7, '2026-09-03T08:00:00.000Z');
    const sections = buildHomeSections({
      continueReadingEntry,
      continueReadingArticle: null,
      offlineCount: 5,
      lastSyncedAt: '2026-09-03T09:30:00.000Z',
    });

    expect(sections.map((s) => s.kind)).toEqual(['continueReading', 'offlineReady', 'latest']);
    expect(sections[0]).toEqual({ kind: 'continueReading', entry: continueReadingEntry, article: null });
    expect(sections[1]).toEqual({
      kind: 'offlineReady',
      count: 5,
      lastSyncedAt: '2026-09-03T09:30:00.000Z',
    });
  });

  it('CHƯA đọc bài nào → khối ① KHÔNG xuất hiện, chỉ còn offlineReady → latest', () => {
    const sections = buildHomeSections({
      continueReadingEntry: null,
      continueReadingArticle: null,
      offlineCount: 0,
      lastSyncedAt: null,
    });

    expect(sections.map((s) => s.kind)).toEqual(['offlineReady', 'latest']);
  });

  it('CHƯA có mốc đồng-bộ nào (iOS chưa từng cấp lượt nền) → offlineReady vẫn xuất hiện, lastSyncedAt=null, KHÔNG throw', () => {
    const sections = buildHomeSections({
      continueReadingEntry: null,
      continueReadingArticle: null,
      offlineCount: 0,
      lastSyncedAt: null,
    });
    const offlineReady = sections.find((s) => s.kind === 'offlineReady');

    expect(offlineReady).toEqual({ kind: 'offlineReady', count: 0, lastSyncedAt: null });
  });

  it('khối latest luôn có mặt, không phụ thuộc dữ liệu đầu vào', () => {
    const sections = buildHomeSections({
      continueReadingEntry: null,
      continueReadingArticle: null,
      offlineCount: 99,
      lastSyncedAt: null,
    });
    expect(sections.some((s) => s.kind === 'latest')).toBe(true);
  });
});

describe('formatSyncTime — giờ:phút theo múi giờ máy', () => {
  it('trả đúng giờ:phút tính TỪ CÙNG cách Date tính (không hard-code theo múi giờ máy chạy test)', () => {
    const iso = '2026-09-03T05:10:20.240Z';
    const expected = (() => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();

    expect(formatSyncTime(iso)).toBe(expected);
    expect(formatSyncTime(iso)).toMatch(/^\d{2}:\d{2}$/);
  });
});
