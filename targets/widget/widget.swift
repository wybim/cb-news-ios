import WidgetKit
import SwiftUI

// Widget màn hình chính CB News (Task 310, BLI 299 — AD-20/AD-22/AD-18/F5).
//
// RÀO BẤT BIẾN (đọc trước khi sửa file này):
//  - CHỈ đọc App Group qua `UserDefaults(suiteName:)`. KHÔNG gọi mạng (`URLSession` hay bất
//    cứ thứ gì tương đương), KHÔNG ghi gì xuống App Group từ phía widget — app ghi, widget
//    chỉ đọc, một chiều tuyệt đối (AD-20).
//  - KHÔNG tự lên lịch làm mới nền của riêng widget (không `BGTaskScheduler`, không hẹn giờ
//    riêng) — WidgetKit có cơ chế làm mới riêng của hệ thống (`Timeline`/`TimelineReloadPolicy`
//    dưới đây), dùng đúng cơ chế đó (F5/AD-18: đúng MỘT lượt chạy nền cho cả app, do
//    `src/background/newsRefreshCycle.ts` giữ).
//  - KHÔNG có khái niệm phiên đăng nhập ở đây — ảnh chụp trong App Group vốn CHỈ chứa nội
//    dung công cộng (AD-20/AD-22), nên widget không cần và không được biết gì về tài khoản.

/// PHẢI khớp nguyên văn `WIDGET_APP_GROUP_ID` (app.config.js, src/data/widgetSnapshot.ts).
private let appGroupId = "group.com.cbcentres.cbnews"

/// PHẢI khớp nguyên văn `WIDGET_APP_GROUP_SNAPSHOT_KEY` (src/data/widgetSnapshot.ts).
private let snapshotStorageKey = "cbnews.widgetSnapshot.appGroup.v1"

// MARK: - Khuôn dữ liệu (phải khớp `WidgetAppGroupPayload`/`WidgetAppGroupItem` phía JS)

private struct SnapshotItem: Decodable {
    let id: Int
    /** Tiêu đề dạng CHỮ THƯỜNG (đã bóc HTML ở phía JS bằng `inlineTextOnly` — widget không
     *  tự parse HTML). */
    let title: String
    let date: String
    let imageUrl: String?
    let deepLink: String
}

private struct SnapshotPayload: Decodable {
    let generatedAt: String
    let items: [SnapshotItem]
}

/// Đọc lại ảnh chụp từ App Group. Trả `nil` nếu chưa từng có ảnh chụp nào (app chưa mở lần
/// nào) hoặc dữ liệu hỏng khuôn — cả hai trường hợp widget hiển thị trạng thái rỗng, KHÔNG
/// crash (AD-20: ảnh chụp là một phép chiếu, xoá/hỏng nó không mất thông tin gì, không có gì
/// để "lỗi" theo nghĩa nghiêm trọng).
private func readSnapshotFromAppGroup() -> SnapshotPayload? {
    guard
        let defaults = UserDefaults(suiteName: appGroupId),
        let raw = defaults.string(forKey: snapshotStorageKey),
        let data = raw.data(using: .utf8)
    else {
        return nil
    }
    return try? JSONDecoder().decode(SnapshotPayload.self, from: data)
}

// MARK: - Timeline

private struct NewsEntry: TimelineEntry {
    let date: Date
    let items: [SnapshotItem]
}

private struct NewsProvider: TimelineProvider {
    func placeholder(in context: Context) -> NewsEntry {
        NewsEntry(date: Date(), items: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (NewsEntry) -> Void) {
        let payload = readSnapshotFromAppGroup()
        completion(NewsEntry(date: Date(), items: payload?.items ?? []))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NewsEntry>) -> Void) {
        let payload = readSnapshotFromAppGroup()
        let entry = NewsEntry(date: Date(), items: payload?.items ?? [])
        // `.atEnd`: xin hệ thống thử làm mới lại SAU khi entry này hết hạn hiển thị — hệ
        // thống WidgetKit tự quyết định thời điểm thật (đúng "cơ chế làm mới riêng của hệ
        // thống" mà F5 yêu cầu dùng, KHÔNG phải một lượt nền do app tự hẹn giờ). App còn chủ
        // động gọi `ExtensionStorage.reloadWidget()` mỗi khi ghi ảnh chụp mới (tiền cảnh lẫn
        // nền — `src/data/widgetSnapshot.ts`), nên widget không chỉ trông chờ vào `.atEnd`.
        completion(Timeline(entries: [entry], policy: .atEnd))
    }
}

// MARK: - Giao diện

private struct CBNewsWidgetEntryView: View {
    var entry: NewsProvider.Entry

    var body: some View {
        if entry.items.isEmpty {
            Text("Mở CB News để đồng bộ tin mới")
                .font(.footnote)
                .multilineTextAlignment(.leading)
                .padding()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(entry.items.prefix(3), id: \.id) { item in
                    Link(destination: deepLinkURL(item.deepLink)) {
                        Text(item.title)
                            .font(.caption)
                            .lineLimit(2)
                            .foregroundStyle(.primary)
                    }
                }
            }
            .padding()
        }
    }

    /// `deepLink` hiện là URL web công khai (F3 của Task 305 — app chưa khai custom URL
    /// scheme). Rơi về trang chủ công khai nếu chuỗi hỏng khuôn, KHÔNG crash widget.
    private func deepLinkURL(_ raw: String) -> URL {
        URL(string: raw) ?? URL(string: "https://cbcentres.com")!
    }
}

private struct CBNewsWidget: Widget {
    let kind: String = "CBNewsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NewsProvider()) { entry in
            CBNewsWidgetEntryView(entry: entry)
                .widgetBackground()
        }
        .configurationDisplayName("CB News")
        .description("Các tiêu đề mới nhất từ CB News.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private extension View {
    /// `containerBackground` (API nền widget chuẩn từ iOS 17) — target này mặc định
    /// deploymentTarget 18.0 (xem `expo-target.config.js`) nên nhánh `#available` luôn đúng;
    /// giữ guard tường minh để file này vẫn đúng nếu sau này deploymentTarget bị hạ.
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(.background, for: .widget)
        } else {
            self.background(Color(.systemBackground))
        }
    }
}

// KHÔNG đánh dấu `private`: kiểu mang `@main` cần truy cập được ở mức module (điểm vào được
// trình biên dịch tổng hợp riêng) — mọi ví dụ WidgetKit/SwiftUI chính thức của Apple đều để
// mức truy cập mặc định (internal) cho đúng một kiểu mang `@main`, không có ngoại lệ nào
// dùng `private` ở đây.
@main
struct CBNewsWidgetBundle: WidgetBundle {
    var body: some Widget {
        CBNewsWidget()
    }
}
