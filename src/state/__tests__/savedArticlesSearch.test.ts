/// <reference types="jest" />
/**
 * Task 309 (BLI 299, `AD-19`/`AD-22`) — tìm trong bài đã lưu + khối ④ của `AD-21`. Phủ đủ
 * SÁU hành vi giao hàng của brief bằng hàm thuần (`../savedArticlesSearch.ts`), đúng khuôn
 * `homeSections.test.ts`/`accessPolicy.test.ts` (JSX không kiểm được trên máy KB — F5).
 */

import type { SavedArticle } from '../../data/savedArticles';
import type { ReadingProgressEntry } from '../../data/readingProgress';
import { buildHomeSections } from '../homeSections';
import {
  buildSavedSearchViewState,
  normalizeForSearch,
  searchSavedArticles,
} from '../savedArticlesSearch';

function saved(id: number, titleHtml: string, contentHtml: string, savedAt = '2026-09-01T00:00:00.000Z'): SavedArticle {
  return {
    id,
    link: `https://cbcentres.com/bai-${id}`,
    date: '2026-08-31T00:00:00',
    titleHtml,
    excerptHtml: '<p>tom tat</p>',
    imageUrl: null,
    contentHtml,
    savedAt,
  };
}

const ARTICLE_TIENG_ANH = saved(
  1,
  '<p>Học <strong>tiếng Anh</strong> mỗi ngày</p>',
  '<div><p>Bài viết nói về cách luyện <em>tiếng Anh</em> hiệu quả.</p></div>',
);
const ARTICLE_KHAC = saved(
  2,
  '<p>Thời tiết Hà Nội hôm nay</p>',
  '<div><p>Trời nắng, chia đôi ngày.</p></div>',
);

describe('normalizeForSearch — bỏ dấu tiếng Việt (kể cả đ) + hạ chữ thường, cả hai phía (F3)', () => {
  it('bỏ dấu và hạ chữ thường một chuỗi có đủ thanh điệu + đ/Đ', () => {
    expect(normalizeForSearch('Tiếng Anh')).toBe('tieng anh');
    expect(normalizeForSearch('Đà Nẵng')).toBe('da nang');
    expect(normalizeForSearch('tieng anh')).toBe('tieng anh');
  });
});

describe('searchSavedArticles — quét tuần tự trên tiêu đề + nội dung ĐÃ bóc thẻ HTML (F2/F4)', () => {
  it('hành vi 1 — có bài lưu, gõ từ khoá có dấu khớp tiêu đề/nội dung → trả bài khớp, không trả bài không khớp', () => {
    const result = searchSavedArticles([ARTICLE_TIENG_ANH, ARTICLE_KHAC], 'tiếng Anh');
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it('hành vi 2 — gõ KHÔNG dấu ("tieng anh") vẫn tìm ra bài có dấu ("tiếng Anh") (F3)', () => {
    const result = searchSavedArticles([ARTICLE_TIENG_ANH, ARTICLE_KHAC], 'tieng anh');
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it('khớp theo NỘI DUNG (không chỉ tiêu đề) — từ "hiệu quả" chỉ có trong contentHtml', () => {
    const result = searchSavedArticles([ARTICLE_TIENG_ANH, ARTICLE_KHAC], 'hieu qua');
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it('hành vi 3 — không bài nào khớp → mảng rỗng (không throw, không trả bừa)', () => {
    const result = searchSavedArticles([ARTICLE_TIENG_ANH, ARTICLE_KHAC], 'bong da');
    expect(result).toEqual([]);
  });

  it('BẪY F2 — nội dung bọc trong <div>: gõ "div" KHÔNG được khớp mọi bài (thẻ đã bị bóc trước khi so, không so trên HTML thô)', () => {
    const result = searchSavedArticles([ARTICLE_TIENG_ANH, ARTICLE_KHAC], 'div');
    expect(result).toEqual([]);
  });

  it('từ khoá rỗng (kể cả toàn khoảng trắng) → mảng rỗng, không throw', () => {
    expect(searchSavedArticles([ARTICLE_TIENG_ANH], '')).toEqual([]);
    expect(searchSavedArticles([ARTICLE_TIENG_ANH], '   ')).toEqual([]);
  });
});

describe('buildSavedSearchViewState — khối ④ hiện gì, SÁU hành vi giao hàng', () => {
  it('hành vi 1 — đã đăng nhập, có bài lưu, từ khoá khớp → kind="results" kèm đúng bài khớp', () => {
    const view = buildSavedSearchViewState({
      isSignedIn: true,
      savedArticles: [ARTICLE_TIENG_ANH, ARTICLE_KHAC],
      query: 'tiếng Anh',
    });
    expect(view.kind).toBe('results');
    expect(view.kind === 'results' && view.articles.map((a) => a.id)).toEqual([1]);
  });

  it('hành vi 2 — gõ không dấu vẫn ra "results" đúng bài có dấu', () => {
    const view = buildSavedSearchViewState({
      isSignedIn: true,
      savedArticles: [ARTICLE_TIENG_ANH, ARTICLE_KHAC],
      query: 'tieng anh',
    });
    expect(view).toEqual({ kind: 'results', articles: [ARTICLE_TIENG_ANH] });
  });

  it('hành vi 3 — có bài lưu nhưng không khớp → "noMatch" (nói rõ không tìm thấy, không phải danh sách rỗng im lặng)', () => {
    const view = buildSavedSearchViewState({
      isSignedIn: true,
      savedArticles: [ARTICLE_TIENG_ANH, ARTICLE_KHAC],
      query: 'bong da',
    });
    expect(view).toEqual({ kind: 'noMatch' });
  });

  it('hành vi 5 — đã đăng nhập nhưng CHƯA lưu bài nào → "noSavedArticles", KHÁC "noMatch"', () => {
    const view = buildSavedSearchViewState({ isSignedIn: true, savedArticles: [], query: 'bat ky' });
    expect(view).toEqual({ kind: 'noSavedArticles' });
    expect(view.kind).not.toBe('noMatch');
  });

  it('hành vi 6 — từ khoá rỗng → "idle", không hiện kết quả, không báo lỗi (kể cả khi đã có bài lưu)', () => {
    const view = buildSavedSearchViewState({
      isSignedIn: true,
      savedArticles: [ARTICLE_TIENG_ANH],
      query: '   ',
    });
    expect(view).toEqual({ kind: 'idle' });
  });

  it('CHƯA đăng nhập LUÔN thắng — dù có bài lưu VÀ từ khoá khớp, vẫn "signInRequired" (rào an toàn #1)', () => {
    const view = buildSavedSearchViewState({
      isSignedIn: false,
      savedArticles: [ARTICLE_TIENG_ANH],
      query: 'tieng anh',
    });
    expect(view).toEqual({ kind: 'signInRequired' });
  });

  describe('hành vi 4 — CHƯA đăng nhập: khối ④ mời đăng nhập VÀ ba khối ①②③ vẫn trả dữ liệu, PHÂN ĐỊNH trong CÙNG một phép thử', () => {
    it('hai quan sát cùng lúc: signInRequired ở khối ④, và buildHomeSections (ba khối trên) không hề bị rỗng/chặn', () => {
      // Quan sát 1 — khối ④: chưa đăng nhập → mời đăng nhập, không phải danh sách/kết quả nào.
      const searchView = buildSavedSearchViewState({
        isSignedIn: false,
        savedArticles: [],
        query: '',
      });
      expect(searchView).toEqual({ kind: 'signInRequired' });

      // Quan sát 2 — ba khối trên (AD-21): `buildHomeSections` KHÔNG nhận tham số account nào
      // (xem chữ ký hàm ở `../homeSections.ts`) — về CẤU TRÚC nó không thể tự khoá theo trạng
      // thái đăng nhập. Ở đây dựng dữ liệu mẫu để chứng minh cả ba khối vẫn trả dữ liệu thật.
      const readingEntry: ReadingProgressEntry = {
        articleId: 7,
        progress: 0.4,
        lastReadAt: '2026-09-03T08:00:00.000Z',
      };
      const homeSections = buildHomeSections({
        continueReadingEntry: readingEntry,
        continueReadingArticle: null,
        offlineCount: 3,
        lastSyncedAt: '2026-09-03T09:00:00.000Z',
      });

      expect(homeSections.map((s) => s.kind)).toEqual(['continueReading', 'offlineReady', 'latest']);
      const offlineReady = homeSections.find((s) => s.kind === 'offlineReady');
      expect(offlineReady).toMatchObject({ count: 3, lastSyncedAt: '2026-09-03T09:00:00.000Z' });
    });
  });
});
