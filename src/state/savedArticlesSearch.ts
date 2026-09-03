import { inlineTextOnly } from '../utils/htmlParser';
import type { SavedArticle } from '../data/savedArticles';

/**
 * Tìm trong bài đã lưu (Task 309, BLI 299 — `AD-19`/`AD-22`) — QUYẾT ĐỊNH THUẦN, tách khỏi
 * `NewsListScreen.tsx` (JSX, máy KB không dựng được — không Xcode/simulator, đúng tiền lệ
 * `accessPolicy.ts`/`homeSections.ts`, Task 298/307, F5) để kiểm được bằng phép thử thật.
 *
 * F2: tìm trong CẢ tiêu đề lẫn nội dung; nội dung là HTML nên phải bóc thẻ trước khi so —
 * DÙNG LẠI `inlineTextOnly()` (`../utils/htmlParser.ts`, đã dùng cho thông báo đẩy ở
 * `background/notifications.ts`), KHÔNG viết bộ bóc thẻ mới. Không bóc thẻ trước thì gõ "div"
 * sẽ khớp MỌI bài (đúng bẫy brief đã cảnh báo).
 *
 * F3: bỏ dấu tiếng Việt + bỏ phân biệt hoa/thường CẢ HAI PHÍA (từ khoá người dùng gõ lẫn văn
 * bản bài) trước khi so khớp — `normalizeForSearch()`.
 *
 * F4: KHÔNG thư viện tìm kiếm, KHÔNG chỉ mục — quét tuần tự trong mảng đã có sẵn trong RAM.
 * Đúng một người dùng thật, số bài lưu nhỏ, quét tuyến tính là đủ (bài học
 * kb/lessons/2026-08-30-chon-xong-de-yen-trong-ho-so.md: dựng chỉ mục là tạo nguồn sự thật
 * thứ hai phải giữ đồng bộ).
 */

/**
 * Bỏ dấu tiếng Việt (kể cả `đ`/`Đ` — KHÔNG tự decompose qua NFD vì đây là ký tự Unicode độc
 * lập, không phải dạng tổ hợp của `d`) + hạ chữ thường. Dùng đúng MỘT hàm này cho cả từ khoá
 * người dùng gõ lẫn văn bản bài (F3) — lệch hàm ở một phía là lệch kết quả so khớp.
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * Quét tuần tự (F4): trả về các bài mà tiêu đề HOẶC nội dung (đã bóc thẻ HTML — F2) chứa từ
 * khoá sau khi chuẩn hoá (F3). Từ khoá rỗng (sau trim) trả về mảng rỗng — quyết định "khối ④
 * hiện gì khi đó" nằm ở `buildSavedSearchViewState` bên dưới, không phải ở hàm quét này.
 */
export function searchSavedArticles(
  articles: readonly SavedArticle[],
  query: string,
): SavedArticle[] {
  const needle = normalizeForSearch(query);
  if (needle.length === 0) return [];
  return articles.filter((article) => {
    const haystack = normalizeForSearch(
      `${inlineTextOnly(article.titleHtml)} ${inlineTextOnly(article.contentHtml)}`,
    );
    return haystack.includes(needle);
  });
}

export type SavedSearchViewState =
  | { kind: 'signInRequired' }
  | { kind: 'idle' }
  | { kind: 'noSavedArticles' }
  | { kind: 'noMatch' }
  | { kind: 'results'; articles: SavedArticle[] };

export type SavedSearchInput = {
  /** Luôn truyền kết quả của `isSignedIn()` (`../state/accessPolicy.ts`) — module này KHÔNG
   *  tự kiểm trạng thái đăng nhập (rào an toàn #5, Task 309). */
  isSignedIn: boolean;
  savedArticles: readonly SavedArticle[];
  query: string;
};

/**
 * Quyết định khối ④ hiện gì — SÁU hành vi giao hàng của Task 309, đúng thứ tự ưu tiên:
 * 1. CHƯA đăng nhập → LUÔN mời đăng nhập, bất kể từ khoá/đã lưu bài hay chưa (`F1`/`AD-22`,
 *    rào an toàn #1 — chỗ SAI ĐẮT NHẤT nếu lật ngược logic này thành khoá cả home). Ba khối
 *    ①②③ ở `homeSections.ts` KHÔNG nhận tham số nào ở đây — chúng không phụ thuộc kết quả
 *    này, đúng cấu trúc chứng minh "ba khối trên vẫn dùng được" (xem test HV4).
 * 2. Từ khoá rỗng (sau trim) → 'idle', không hiện kết quả, không báo lỗi (hành vi 6).
 * 3. Đã đăng nhập nhưng CHƯA lưu bài nào → 'noSavedArticles', khác 'noMatch' (hành vi 5).
 * 4. Có bài lưu nhưng 0 khớp → 'noMatch', nói rõ không tìm thấy, không im lặng (hành vi 3).
 * 5. Có khớp → 'results' (hành vi 1, và hành vi 2 vì so khớp đã qua `normalizeForSearch`).
 */
export function buildSavedSearchViewState(input: SavedSearchInput): SavedSearchViewState {
  if (!input.isSignedIn) return { kind: 'signInRequired' };

  const trimmedQuery = input.query.trim();
  if (trimmedQuery.length === 0) return { kind: 'idle' };

  if (input.savedArticles.length === 0) return { kind: 'noSavedArticles' };

  const results = searchSavedArticles(input.savedArticles, trimmedQuery);
  if (results.length === 0) return { kind: 'noMatch' };

  return { kind: 'results', articles: results };
}
