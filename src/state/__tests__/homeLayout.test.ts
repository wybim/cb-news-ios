/// <reference types="jest" />
/**
 * Task 311 (BLI 299, khảo sát iPad thật) — cách xếp home theo bề rộng. Phép thử PHÂN ĐỊNH
 * ĐƯỢC: bề rộng nhỏ (iPhone) ra một cách xếp, bề rộng lớn (iPad) ra cách khác — hai quan sát
 * ngược chiều, không phải một tiêu chí luôn đạt (rào bảy điều nhấn lại #6 của brief).
 */

import {
  homeListColumns,
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
