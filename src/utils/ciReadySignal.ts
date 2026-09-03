import { File, Paths } from 'expo-file-system';

/**
 * Task 312 (BLI 299) — dấu hiệu ĐO ĐƯỢC cho workflow `capture-ipad-screenshot.yml` biết
 * home đã tải xong lần đầu, THAY cho chờ số giây cố định (bài học
 * `kb/lessons/2026-08-29-tieu-chi-nghiem-thu-dua-tren-hanh-vi-chua-do.md`: một tiêu chí
 * phải TRƯỢT ĐƯỢC — số giây cố định không trượt được khi mạng chậm, chỉ đúng hoặc sai
 * theo may rủi).
 *
 * Vì sao chọn GHI FILE thay vì `console.log` + dò log của simulator: `console.log` trên
 * iOS đi qua cầu native (`RCTLog`/NSLog) trước khi ra `xcrun simctl spawn ... log stream`,
 * và ngưỡng log ở bản Release (`xcodebuild -configuration Release`, đúng cấu hình workflow
 * này dùng) có lọc bớt log info-level hay không thì máy KB không có Xcode/simulator để đo
 * thật (F5 brief Task 312) — không kiểm được thì không đưa vào làm cơ chế chính.
 *
 * Ghi file vào `Paths.document` (ánh xạ `NSDocumentDirectory`, quy ước sandbox của chính
 * iOS, không phải hành vi riêng của thư viện) là cơ chế CI đọc được từ NGOÀI app, qua lệnh
 * chính thức của Apple `xcrun simctl get_app_container <udid> <bundle> data` — không phụ
 * thuộc ngưỡng log chưa đo ở trên.
 *
 * Nội dung tệp: chỉ một mốc thời gian dạng số (không phải dữ liệu người dùng nào) — không
 * gửi đi đâu, không phạm `AD-1`.
 */
const READY_MARKER_FILE_NAME = 'ci-home-ready.txt';

export function markHomeContentReady(): void {
  try {
    const file = new File(Paths.document, READY_MARKER_FILE_NAME);
    if (!file.exists) {
      file.create({ overwrite: true });
    }
    file.write(String(Date.now()));
  } catch {
    // Best-effort — một thiết bị thật ghi lỗi (hiếm) không được làm app dừng render.
    // Không có phép thử hàm thuần cho hàm này: nó chỉ có ý nghĩa trên simulator/thiết bị
    // thật (I/O filesystem), máy KB không dựng được để kiểm (F5 brief Task 312).
  }
}
