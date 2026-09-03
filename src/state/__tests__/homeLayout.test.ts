/// <reference types="jest" />
/**
 * Task 311 (BLI 299, khảo sát iPad thật) — cách xếp home theo bề rộng. Phép thử PHÂN ĐỊNH
 * ĐƯỢC: bề rộng nhỏ (iPhone) ra một cách xếp, bề rộng lớn (iPad) ra cách khác — hai quan sát
 * ngược chiều, không phải một tiêu chí luôn đạt (rào bảy điều nhấn lại #6 của brief).
 */

import {
  DEFAULT_HOME_POST_COUNT,
  homeListColumns,
  resolveHomeInitialPostCount,
  resolveHomeLayoutMetrics,
  resolveHomeLayoutMode,
  TWO_COLUMN_MIN_WIDTH,
} from '../homeLayout';

describe('resolveHomeLayoutMode', () => {
  it('bề rộng iPhone (portrait, kể cả máy to nhất hiện có ~430pt) → single', () => {
    expect(resolveHomeLayoutMode(390)).toBe('single');
    expect(resolveHomeLayoutMode(430)).toBe('single');
  });

  it('bề rộng iPad (portrait, kể cả máy nhỏ nhất hiện có ~744pt) → twoColumn', () => {
    expect(resolveHomeLayoutMode(744)).toBe('twoColumn');
    expect(resolveHomeLayoutMode(1032)).toBe('twoColumn'); // iPad Pro 13" portrait
  });

  it('đúng ngưỡng TWO_COLUMN_MIN_WIDTH → twoColumn (>=, không phải >)', () => {
    expect(resolveHomeLayoutMode(TWO_COLUMN_MIN_WIDTH)).toBe('twoColumn');
  });

  it('ngay dưới ngưỡng một điểm → single', () => {
    expect(resolveHomeLayoutMode(TWO_COLUMN_MIN_WIDTH - 1)).toBe('single');
  });
});

describe('homeListColumns', () => {
  it('single → 1 cột, twoColumn → 2 cột', () => {
    expect(homeListColumns('single')).toBe(1);
    expect(homeListColumns('twoColumn')).toBe(2);
  });
});

describe('resolveHomeLayoutMetrics', () => {
  it('Task 312: twoColumn dùng mép rộng hơn single — ảnh chụp thật lộ mép 16pt của iPhone dán sát trên khung iPad', () => {
    expect(resolveHomeLayoutMetrics('single').horizontalPadding).toBe(16);
    expect(resolveHomeLayoutMetrics('twoColumn').horizontalPadding).toBeGreaterThan(
      resolveHomeLayoutMetrics('single').horizontalPadding,
    );
  });
});

describe('resolveHomeInitialPostCount', () => {
  it('single (iPhone) → luôn DEFAULT_HOME_POST_COUNT, bất kể chiều cao — hành vi iPhone giữ nguyên', () => {
    expect(resolveHomeInitialPostCount('single', 660)).toBe(DEFAULT_HOME_POST_COUNT);
    expect(resolveHomeInitialPostCount('single', 1376)).toBe(DEFAULT_HOME_POST_COUNT);
  });

  it('twoColumn (iPad Pro 13" portrait, ~1376pt) → nhiều hơn DEFAULT_HOME_POST_COUNT — ảnh chụp thật (run 2, work item 312) lộ 10 bài chỉ ra 5 hàng, không lấp nổi khung cao', () => {
    expect(resolveHomeInitialPostCount('twoColumn', 1376)).toBeGreaterThan(DEFAULT_HOME_POST_COUNT);
  });

  it('twoColumn → luôn số CHẴN (đúng bội số cột — 2 cột thì mỗi hàng ra đúng 2 bài, không dở hàng)', () => {
    expect(resolveHomeInitialPostCount('twoColumn', 1376) % 2).toBe(0);
    expect(resolveHomeInitialPostCount('twoColumn', 900) % 2).toBe(0);
  });

  it('twoColumn, chiều cao càng lớn → số bài không giảm (đơn điệu không giảm theo chiều cao)', () => {
    const short = resolveHomeInitialPostCount('twoColumn', 900);
    const tall = resolveHomeInitialPostCount('twoColumn', 2000);
    expect(tall).toBeGreaterThanOrEqual(short);
  });

  it('twoColumn, chiều cao cực đoan (Stage Manager) → có trần, không tải vô hạn', () => {
    expect(resolveHomeInitialPostCount('twoColumn', 100000)).toBeLessThanOrEqual(40);
  });

  it('twoColumn, chiều cao rất nhỏ (≤ chrome) → vẫn ít nhất DEFAULT_HOME_POST_COUNT, không rơi về 0', () => {
    expect(resolveHomeInitialPostCount('twoColumn', 0)).toBeGreaterThanOrEqual(DEFAULT_HOME_POST_COUNT);
  });
});
