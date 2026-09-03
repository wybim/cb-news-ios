import { File, Paths } from 'expo-file-system';
import { formatHomeReadyMarker } from './homeReadyMarker';

/**
 * Task 312 (BLI 299) — dấu hiệu ĐO ĐƯỢC cho workflow `capture-ipad-screenshot.yml` biết
 * home đã tải xong, THAY cho chờ số giây cố định (bài học
 * `kb/lessons/2026-08-29-tieu-chi-nghiem-thu-dua-tren-hanh-vi-chua-do.md`: một tiêu chí
 * phải TRƯỢT ĐƯỢC — số giây cố định không trượt được khi mạng chậm, chỉ đúng hoặc sai
 * theo may rủi).
 *
 * Vòng 2 (ảnh `ipad-13-inch-home-run2.png`, work item 312): gọi hàm này ở MỌI lần một trang
 * settle (đầu tiên, phân trang, làm mới) — KHÔNG chỉ lần đầu. Lý do: ảnh run 2 cho thấy lần
 * tải đầu settle xong vẫn có thể còn một lượt PHÂN TRANG đang bay (khi danh sách trang đầu
 * chưa lấp đủ khung, `FlatList` phát `onEndReached` gần như ngay lập tức). Mỗi lần gọi GHI
 * ĐÈ mốc thời gian mới — workflow phía CI dò tới khi tệp NGỪNG đổi (đứng yên hai lượt liên
 * tiếp), không chỉ tới khi tệp XUẤT HIỆN lần đầu, nên "còn lượt tải khác đang bay" tự động
 * bị bắt mà không cần biết trước sẽ có bao nhiêu lượt.
 *
 * Task 318 (BLI 299) — vòng 2 vẫn chụp được màn TRỐNG hai lần trong bốn lần chạy (work item
 * 318): mốc thời gian ĐỨNG YÊN chỉ trả lời "lần settle gần nhất là lúc nào", không trả lời
 * "trên màn có bài để chụp chưa" — hai câu khác nhau, và cổng cũ mở được ngay cả khi
 * `posts` rỗng (mọi nguyên nhân gốc, kể cả nguyên nhân chưa biết, đều đi qua cùng cửa này).
 * Từ vòng này, tệp mang THÊM số bài đang hiện trên màn — `markHomeContentReady(postCount)`
 * ghi `<postCount>:<mốc thời gian>`. CI (`capture-ipad-screenshot.yml`) chỉ coi là ổn định
 * khi số bài > 0 VÀ toàn bộ giá trị đứng yên hai lượt dò liên tiếp; số bài 0 không bao giờ
 * được tính là ổn định. Định dạng chọn đơn giản nhất đọc được bằng shell không cần công cụ
 * ngoài: `${CUR%%:*}` cắt lấy số bài.
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
 * Nội dung tệp: số bài đang hiện + một mốc thời gian dạng số (không phải dữ liệu người dùng
 * nào) — không gửi đi đâu, không phạm `AD-1`. Ghi lại nhiều lần trong một phiên (kể cả ngoài
 * lúc chụp ảnh) là chi phí không đáng kể — một lần ghi text vài byte — nên không cần cờ
 * bật/tắt riêng cho CI; hành vi giống nhau cho mọi người dùng thật.
 */
const READY_MARKER_FILE_NAME = 'ci-home-ready.txt';

export function markHomeContentReady(postCount: number): void {
  try {
    const file = new File(Paths.document, READY_MARKER_FILE_NAME);
    if (!file.exists) {
      file.create({ overwrite: true });
    }
    file.write(formatHomeReadyMarker(postCount));
  } catch {
    // Best-effort — một thiết bị thật ghi lỗi (hiếm) không được làm app dừng render.
  }
}
