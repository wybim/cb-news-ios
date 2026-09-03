/// <reference types="jest" />
/**
 * Task 307 (BLI 299, `AD-21`) — toán đổi vị trí cuộn ↔ tiến độ đọc, dùng để khối "Đang đọc
 * dở" đưa người dùng về ĐÚNG chỗ đang đọc, không phải về đầu bài.
 */

import { computeScrollOffsetFromProgress, computeScrollProgress } from '../readingPosition';

describe('computeScrollProgress', () => {
  it('đầu bài (offsetY=0) → 0', () => {
    expect(computeScrollProgress(0, 2000, 800)).toBe(0);
  });

  it('cuộn hết (offsetY = contentHeight - layoutHeight) → 1', () => {
    expect(computeScrollProgress(1200, 2000, 800)).toBe(1);
  });

  it('cuộn giữa chừng → tỉ lệ đúng', () => {
    expect(computeScrollProgress(600, 2000, 800)).toBeCloseTo(0.5, 5);
  });

  it('cuộn quá đà (offsetY vượt contentHeight - layoutHeight, bounce của iOS) → kẹp về 1, không throw/không >1', () => {
    expect(computeScrollProgress(5000, 2000, 800)).toBe(1);
  });

  it('offsetY âm (bounce ở đầu) → kẹp về 0', () => {
    expect(computeScrollProgress(-50, 2000, 800)).toBe(0);
  });

  it('bài NGẮN hơn một màn hình (scrollable <= 0) → 0, không chia cho 0/âm', () => {
    expect(computeScrollProgress(0, 500, 800)).toBe(0);
    expect(computeScrollProgress(0, 800, 800)).toBe(0);
  });
});

describe('computeScrollOffsetFromProgress — chiều ngược lại, dùng để khôi phục vị trí', () => {
  it('progress=0 → offset 0 (đầu bài)', () => {
    expect(computeScrollOffsetFromProgress(0, 2000, 800)).toBe(0);
  });

  it('progress=1 → offset = scrollable tối đa', () => {
    expect(computeScrollOffsetFromProgress(1, 2000, 800)).toBe(1200);
  });

  it('progress=0.5 → đúng nửa quãng có thể cuộn', () => {
    expect(computeScrollOffsetFromProgress(0.5, 2000, 800)).toBeCloseTo(600, 5);
  });

  it('progress ngoài khoảng 0..1 (dữ liệu hỏng) → kẹp về biên, không trả giá trị âm/vượt quá', () => {
    expect(computeScrollOffsetFromProgress(-0.2, 2000, 800)).toBe(0);
    expect(computeScrollOffsetFromProgress(1.5, 2000, 800)).toBe(1200);
  });

  it('bài ngắn hơn một màn hình → offset luôn 0', () => {
    expect(computeScrollOffsetFromProgress(0.7, 500, 800)).toBe(0);
  });

  it('round-trip: progress → offset → progress phải xấp xỉ ban đầu', () => {
    const original = 0.37;
    const offset = computeScrollOffsetFromProgress(original, 3000, 900);
    expect(computeScrollProgress(offset, 3000, 900)).toBeCloseTo(original, 5);
  });
});
