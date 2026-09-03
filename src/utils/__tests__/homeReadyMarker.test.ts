/// <reference types="jest" />
/**
 * Task 318 (BLI 299) — dấu hiệu chờ CI giờ mang SỐ BÀI đang hiện, không chỉ mốc thời gian
 * (mốc thời gian đứng yên chỉ trả lời "lần settle gần nhất là lúc nào", không trả lời
 * "trên màn có bài để chụp chưa" — xem `homeReadyMarker.ts`/`ciReadySignal.ts`).
 *
 * DoD Task 318 mục 1: số bài đọc được từ chuỗi mà không cần công cụ ngoài. DoD "Phép thử
 * cho hàm ghi dấu hiệu": số bài 0 và số bài > 0 phải ra hai giá trị PHÂN BIỆT ĐƯỢC.
 */

import { formatHomeReadyMarker } from '../homeReadyMarker';

describe('formatHomeReadyMarker', () => {
  test('số bài 0 và số bài > 0 ra hai giá trị phân biệt được', () => {
    const zero = formatHomeReadyMarker(0, 1_000);
    const nonZero = formatHomeReadyMarker(5, 1_000);

    expect(zero).not.toBe(nonZero);
    // Đọc số bài ở vế trước dấu ':' — đúng cách CI cắt chuỗi (`${CUR%%:*}`).
    expect(zero.split(':')[0]).toBe('0');
    expect(nonZero.split(':')[0]).toBe('5');
  });

  test('mang cả mốc thời gian ở vế sau dấu :, không chỉ số bài', () => {
    const marker = formatHomeReadyMarker(3, 1_700_000_000_000);
    expect(marker).toBe('3:1700000000000');
  });

  test('cùng số bài, mốc thời gian đổi thì toàn bộ giá trị đổi (workflow dò "đứng yên" bắt được lượt tải mới)', () => {
    const first = formatHomeReadyMarker(3, 1_000);
    const second = formatHomeReadyMarker(3, 2_000);
    expect(first).not.toBe(second);
  });

  test('mặc định dùng Date.now() khi không truyền mốc thời gian', () => {
    const before = Date.now();
    const marker = formatHomeReadyMarker(1);
    const after = Date.now();
    const [, tsPart] = marker.split(':');
    const ts = Number(tsPart);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
