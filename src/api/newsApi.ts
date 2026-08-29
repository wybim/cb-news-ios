/**
 * Lớp gọi API tin tức — WordPress REST API của cbcentres.com, chuyên mục "Tin tức tổng"
 * (`categories=6`, đã chốt ở Task 258/260, xem khao-sat-nguon-tin.md).
 *
 * Module này CHỈ dùng `fetch` toàn cục (có sẵn từ React Native/Hermes lẫn Node 18+), không
 * đụng SecureStore/AsyncStorage/React — để có thể unit-test bằng `node` thuần sau khi biên
 * dịch bằng `tsc`, không cần dựng máy ảo iOS.
 *
 * BẪY ĐÃ ĐO (Task 267): tham số `_fields` làm rỗng `_embedded` dù có liệt kê `_embedded`
 * trong danh sách trường — quét 189/189 bài thật bằng `_fields=id,featured_media,_embedded`
 * ra toàn bộ `_embedded: {}`, trong khi bỏ `_fields` thì `_embedded['wp:featuredmedia']` có đủ.
 * Vì vậy các hàm dưới đây KHÔNG dùng `_fields` khi có `_embed`.
 */

export const NEWS_CATEGORY_ID = 6;
const WP_API_BASE = 'https://cbcentres.com/wp-json/wp/v2';

export type PostSummary = {
  id: number;
  link: string;
  /** ISO 8601, giờ địa phương của WordPress (không có hậu tố Z) — dùng nguyên văn để hiển thị. */
  date: string;
  /** HTML thật, ví dụ `<p>...</p>` hoặc chứa thẻ <strong>/<em> — KHÔNG bóc bằng regex. */
  titleHtml: string;
  /** HTML thật — xem ghi chú titleHtml. */
  excerptHtml: string;
  /** URL ảnh đại diện đã ưu tiên size "medium"; null nếu bài không có ảnh đại diện. */
  imageUrl: string | null;
};

export type PostDetail = PostSummary & {
  /** HTML thật, nội dung đầy đủ — trường đo được: `content.rendered` (Task 267, đo id 7936). */
  contentHtml: string;
};

export type PostListPage = {
  posts: PostSummary[];
  page: number;
  /** Từ header `x-wp-total` của chính lần gọi này — KHÔNG hard-code. */
  totalPosts: number;
  /** Từ header `x-wp-totalpages` của chính lần gọi này — KHÔNG hard-code. */
  totalPages: number;
};

export class NewsApiError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NewsApiError';
  }
}

type WpEmbedded = {
  'wp:featuredmedia'?: Array<{
    source_url?: string;
    media_details?: { sizes?: { medium?: { source_url?: string } } };
  }>;
};

type WpPostJson = {
  id: number;
  link: string;
  date: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  featured_media?: number;
  _embedded?: WpEmbedded;
};

/**
 * Ưu tiên ảnh đã resize (`medium`, nhẹ hơn cho card danh sách); fallback ảnh gốc; null nếu
 * bài không có ảnh đại diện (`featured_media: 0` hoặc `_embedded` không có `wp:featuredmedia`
 * — ca thật đã quét toàn bộ 189/189 bài không gặp; test bằng ca dựng, xem newsApi.test.ts).
 */
export function extractFeaturedImage(embedded: WpEmbedded | undefined): string | null {
  const media = embedded?.['wp:featuredmedia']?.[0];
  if (!media) return null;
  return media.media_details?.sizes?.medium?.source_url ?? media.source_url ?? null;
}

function toSummary(item: WpPostJson): PostSummary {
  return {
    id: item.id,
    link: item.link,
    date: item.date,
    titleHtml: item.title?.rendered ?? '',
    excerptHtml: item.excerpt?.rendered ?? '',
    imageUrl: extractFeaturedImage(item._embedded),
  };
}

function readIntHeader(headers: Headers, name: string): number {
  const raw = headers.get(name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

async function fetchJson<T>(url: string): Promise<{ data: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new NewsApiError('Không kết nối được tới cbcentres.com (mất mạng?).', err);
  }
  if (!res.ok) {
    throw new NewsApiError(`cbcentres.com trả lỗi HTTP ${res.status}.`);
  }
  const data = (await res.json()) as T;
  return { data, headers: res.headers };
}

/**
 * Trang danh sách bài của chuyên mục Tin tức tổng. `page` bắt đầu từ 1.
 * `totalPosts`/`totalPages` đọc lại từ header của CHÍNH lần gọi này mỗi lần — số bài đổi
 * theo thời gian (189 chỉ là số đo lúc 29/08/2026, không phải hằng số).
 */
export async function fetchNewsPage(page: number, perPage = 10): Promise<PostListPage> {
  const url =
    `${WP_API_BASE}/posts?categories=${NEWS_CATEGORY_ID}&page=${page}&per_page=${perPage}` +
    `&orderby=date&order=desc&_embed=wp:featuredmedia`;
  const { data, headers } = await fetchJson<WpPostJson[]>(url);
  return {
    posts: data.map(toSummary),
    page,
    totalPosts: readIntHeader(headers, 'x-wp-total'),
    totalPages: readIntHeader(headers, 'x-wp-totalpages'),
  };
}

/** Chi tiết một bài — nội dung đầy đủ nằm ở `contentHtml` (đo được: trường `content.rendered`). */
export async function fetchPostDetail(id: number): Promise<PostDetail> {
  const url = `${WP_API_BASE}/posts/${id}?_embed=wp:featuredmedia`;
  const { data } = await fetchJson<WpPostJson>(url);
  return {
    ...toSummary(data),
    contentHtml: data.content?.rendered ?? '',
  };
}
