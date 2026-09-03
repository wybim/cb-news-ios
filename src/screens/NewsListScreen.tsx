import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fetchNewsPage, NewsApiError, type PostDetail, type PostSummary } from '../api/newsApi';
import { ArticleImage } from '../components/ArticleImage';
import { InlineHtmlText } from '../components/RenderedHtml';
import { formatVietnameseDate } from '../utils/formatDate';
import { useSavedArticles, type SavedArticle } from '../data/savedArticles';
import { loadHomeSectionsData } from '../data/homeData';
import { getAllCachedArticles } from '../data/articleCache';
import { buildHomeSections, formatSyncTime, type HomeSectionsInput } from '../state/homeSections';
import {
  homeListColumns,
  resolveHomeInitialPostCount,
  resolveHomeLayoutMetrics,
  resolveHomeLayoutMode,
} from '../state/homeLayout';
import { buildCachedSearchViewState, buildSavedSearchViewState } from '../state/savedArticlesSearch';
import { isSignedIn } from '../state/accessPolicy';
import type { AccountState } from '../state/accountStore';
import { triggerManualRefresh } from '../background/manualRefresh';
import { markHomeContentReady } from '../utils/ciReadySignal';

type Tab = 'latest' | 'saved';

const EMPTY_HOME_DATA: HomeSectionsInput = {
  continueReadingEntry: null,
  continueReadingArticle: null,
  offlineCount: 0,
  lastSyncedAt: null,
};

/**
 * Danh sách bài — giao diện GỐC của app (không WebView), đọc chuyên mục Tin tức tổng qua
 * `newsApi.ts`. Tab "Đã lưu" đọc thẳng từ `savedArticlesStore` (không cần mạng) — đây là phần
 * app làm được mà trang web không làm được (Guideline 4.2.2, xem báo cáo Task 267).
 *
 * Task 307 (BLI 299, `AD-21`): NÂNG chính màn này thành HOME NHIỀU KHỐI — KHÔNG thêm màn
 * trung gian nào. Phía trên tab bar hiện có: khối ① "Đang đọc dở" (nếu có) → khối ② "Đã tải
 * sẵn để đọc offline". Tab "Mới nhất" NGAY DƯỚI chính là khối ③. Cả ba khối đọc dữ liệu qua
 * `homeData.ts`/`homeSections.ts` (phân vùng THIẾT BỊ, không cần đăng nhập — `F3`/`AD-22`).
 * Quyết định thứ tự/hiện gì nằm ở `homeSections.ts` (hàm thuần, có phép thử) — ở đây chỉ vẽ
 * (F6, đúng tiền lệ `accessPolicy.ts` Task 298).
 *
 * Task 309 (BLI 299, `AD-19`/`AD-22`): thêm khối ④ — TÌM TRONG BÀI ĐÃ LƯU, ngay dưới khối ②.
 * Đây là hạng mục DUY NHẤT của vòng 2 được phép đòi đăng nhập (`AD-22`) — dùng `isSignedIn()`
 * (`accessPolicy.ts`), KHÔNG tự kiểm trạng thái đăng nhập (rào an toàn #5). Chưa đăng nhập →
 * khối ④ hiện lời mời kèm lý do; BA khối ①②③ ở trên KHÔNG đổi, vẫn dùng được bình thường —
 * đây là rào quan trọng nhất của task (F1, dẫm lại 5.1.1(v) nếu làm sai hướng này). Quyết
 * định khối ④ hiện gì nằm ở `savedArticlesSearch.ts` (hàm thuần, có phép thử) — ở đây chỉ vẽ.
 *
 * Task 311 (BLI 299, khảo sát iPad thật): ở bề rộng iPad, khối ①②③④ KHÔNG đổi — `AD-21` vẫn
 * đúng bốn khối, không thêm màn, không thêm thư viện điều hướng. Chỉ CÁCH XẾP đổi: khối ① và
 * ② nằm cùng một hàng thay vì xếp chồng, và danh sách bài chuyển sang lưới hai cột. Quyết
 * định "bề rộng nào ra cách xếp nào" nằm ở `homeLayout.ts` (hàm thuần, có phép thử) — ở đây
 * chỉ đọc `useWindowDimensions()` rồi vẽ theo kết quả của hàm đó.
 *
 * Task 315 (BLI 299, `AD-21`) — SỬA rào PM đặt sai ở brief Task 309: khối ④ giờ chạy được khi
 * CHƯA đăng nhập, không còn hiện lời mời đăng nhập chặn chức năng (đúng hình dạng Guideline
 * 5.1.1(v) Apple từ chối, xem work item 312/315). Rẽ nhánh DUY NHẤT theo `isSignedIn(account)`:
 * đã đăng nhập → `buildSavedSearchViewState` tìm trên bài ĐÃ LƯU (JSX/hành vi Y NGUYÊN Task
 * 309, không sửa); CHƯA đăng nhập → `buildCachedSearchViewState` tìm trên CACHE (phân vùng
 * thiết bị, `articleCache.getAllCachedArticles()`), một ô nhập liệu dùng được thật. KHÔNG trộn
 * hai nguồn (rào an toàn #6 Task 315, `AD-19`/`AD-23`) — luôn đúng một nhánh tại một thời điểm.
 */
export function NewsListScreen({
  account,
  onOpenArticle,
}: {
  account: AccountState;
  onOpenArticle: (postId: number) => void;
}) {
  // Task 311 — cách xếp theo bề rộng (`homeLayout.ts`, hàm thuần). `useWindowDimensions()` tự
  // cập nhật khi xoay máy hoặc đổi cỡ split-view trên iPad, không cần tự đăng ký listener.
  const { width, height } = useWindowDimensions();
  const layoutMode = resolveHomeLayoutMode(width);
  const listColumns = homeListColumns(layoutMode);
  // Task 312 — mép ngang rộng hơn ở bề rộng iPad (`homeLayout.ts`, hàm thuần), áp cho
  // header/tabs/lưới danh sách để nội dung không dán sát mép trên khung 2064pt (ảnh chụp
  // thật lộ vấn đề này, xem work item 299).
  const { horizontalPadding } = resolveHomeLayoutMetrics(layoutMode);
  // Task 312 vòng 2 — số bài tải MỖI TRANG, tính theo layout thật (`homeLayout.ts`, hàm
  // thuần) để danh sách lấp+tràn màn iPad ngay từ trang đầu (ảnh run 2: 10 bài chỉ ra 5 hàng
  // 2 cột, không lấp nổi khung cao, khiến `onEndReached` phát ngay và lộ vòng xoay chân
  // danh sách + 35,5% màn dưới trắng). CỐ ĐỊNH bằng ref cho SUỐT vòng đời màn hình, tính một
  // lần từ layout lúc mount — KHÔNG đổi giữa các trang: WordPress REST API tính offset theo
  // `per_page` của TỪNG lần gọi, đổi per_page giữa hai trang làm lệch offset, gây trùng hoặc
  // hụt bài giữa hai trang liên tiếp.
  const pageSizeRef = useRef(resolveHomeInitialPostCount(layoutMode, height));

  const [tab, setTab] = useState<Tab>('latest');
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedMap = useSavedArticles();

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNewsPage(nextPage, pageSizeRef.current);
      setPosts((prev) => (replace ? result.posts : [...prev, ...result.posts]));
      setPage(result.page);
      // Đọc totalPages TỪ CHÍNH lần gọi này mỗi lần — không hard-code (bẫy brief Task 267).
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof NewsApiError ? err.message : 'Có lỗi khi tải danh sách bài.');
    } finally {
      setLoading(false);
      // Task 312 vòng 2: ghi dấu hiệu ở MỌI lần settle (đầu tiên, phân trang, làm mới) —
      // không chỉ lần đầu. Ảnh run 2 lộ ra một lượt phân trang có thể còn bay lúc chụp dù
      // lần tải đầu đã xong; workflow giờ dò tới khi tệp NGỪNG đổi (đứng yên), không chỉ tới
      // khi tệp xuất hiện lần đầu — xem `capture-ipad-screenshot.yml`.
      markHomeContentReady();
    }
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(1, true);
    setRefreshing(false);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (loading || totalPages === null) return;
    if (page >= totalPages) return; // đã tới trang cuối theo x-wp-totalpages đọc được
    void loadPage(page + 1, false);
  }, [loading, totalPages, page, loadPage]);

  // Task 307 — dữ liệu 3 khối home (`homeData.ts`, phân vùng thiết bị, không cần đăng nhập).
  // `homeData === null` = chưa nạp xong lượt đầu (AsyncStorage, gần như tức thời) — header vẽ
  // tạm bằng `EMPTY_HOME_DATA` (khối ② hiện "chưa đồng bộ") trong lúc chờ, rồi tự cập nhật
  // ngay khi `loadHomeData()` xong. `buildHomeSections` là hàm THUẦN — mọi quyết định thứ
  // tự/hiện gì đã xong trước khi tới đây, xem `homeSections.ts`.
  const [homeData, setHomeData] = useState<HomeSectionsInput | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const loadHomeData = useCallback(async () => {
    const data = await loadHomeSectionsData();
    setHomeData(data);
  }, []);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  // Task 315 — nguồn tìm kiếm cho khối ④ khi CHƯA đăng nhập: toàn bộ bài đã cache (phân vùng
  // thiết bị, `articleCache.getAllCachedArticles()`). Nạp không phụ thuộc trạng thái đăng nhập
  // (cùng phân vùng với 3 khối trên, `F3`/`AD-22`) — chỉ KHÔNG dùng tới khi đã đăng nhập.
  const [cachedArticles, setCachedArticles] = useState<PostDetail[]>([]);

  const loadCachedArticles = useCallback(async () => {
    const articles = await getAllCachedArticles();
    setCachedArticles(articles);
  }, []);

  useEffect(() => {
    void loadCachedArticles();
  }, [loadCachedArticles]);

  const homeSections = useMemo(() => buildHomeSections(homeData ?? EMPTY_HOME_DATA), [homeData]);
  const continueReadingSection = homeSections.find((s) => s.kind === 'continueReading');
  const offlineReadySection = homeSections.find((s) => s.kind === 'offlineReady');

  // Nút "Làm mới" thủ công (F5/AD-18): gọi ĐÚNG MỘT chu trình đã có qua `manualRefresh.ts`
  // (KHÔNG dựng chu trình thứ hai), rồi nạp lại dữ liệu trên màn — cả danh sách LẪN 3 khối
  // home, vì chu trình đó có thể vừa đổi cache offline/mốc đồng-bộ (khối ②). Task 315: nạp lại
  // CẢ `cachedArticles` — chu trình có thể vừa thêm bài mới vào cache, khối ④ (guest) phải tìm
  // được trên dữ liệu mới nhất, không phải bản chụp lúc mount.
  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await triggerManualRefresh();
    } finally {
      setManualRefreshing(false);
    }
    await Promise.all([loadPage(1, true), loadHomeData(), loadCachedArticles()]);
  }, [loadPage, loadHomeData, loadCachedArticles]);

  const savedList = useMemo<SavedArticle[]>(
    () => Object.values(savedMap).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    [savedMap],
  );

  // Task 309/315 — khối ④ (ô tìm kiếm). `isSignedIn(account)` là NƠI DUY NHẤT hỏi trạng thái
  // đăng nhập (rào an toàn #5 Task 315/#5 Task 309) — chọn ĐÚNG MỘT nhánh nguồn dữ liệu, không
  // trộn (rào an toàn #6 Task 315): đã đăng nhập → bài ĐÃ LƯU (`buildSavedSearchViewState`,
  // hành vi Task 309 y nguyên); CHƯA đăng nhập → CACHE thiết bị (`buildCachedSearchViewState`,
  // Task 315). Cả hai đều là hàm THUẦN, có phép thử — ở đây chỉ vẽ theo kết quả.
  const signedIn = isSignedIn(account);
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const savedSearchView = useMemo(
    () =>
      buildSavedSearchViewState({
        isSignedIn: signedIn,
        savedArticles: savedList,
        query: savedSearchQuery,
      }),
    [signedIn, savedList, savedSearchQuery],
  );
  const cachedSearchView = useMemo(
    () => buildCachedSearchViewState({ cachedArticles, query: savedSearchQuery }),
    [cachedArticles, savedSearchQuery],
  );

  const showInitialLoading = tab === 'latest' && loading && posts.length === 0 && !error;
  const showInitialError = tab === 'latest' && error !== null && posts.length === 0;
  const showEmptySaved = tab === 'saved' && savedList.length === 0;
  const data: Array<PostSummary | SavedArticle> = tab === 'latest' ? posts : savedList;
  const showList = !showInitialLoading && !showInitialError && !showEmptySaved;

  return (
    <View style={styles.container}>
      <View style={[styles.homeHeader, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.homeHeaderTitleRow}>
          <Text style={styles.homeHeaderTitle}>Dành cho bạn</Text>
          <Pressable onPress={() => void handleManualRefresh()} hitSlop={12} disabled={manualRefreshing}>
            {manualRefreshing ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.refreshLink}>Làm mới</Text>
            )}
          </Pressable>
        </View>

        {/* Task 311: bề rộng iPad (twoColumn) → khối ①②xếp CÙNG một hàng thay vì chồng lên
            nhau; bề rộng iPhone (single) → giữ nguyên xếp chồng như trước. Cùng nội dung,
            khác cách xếp (`homeLayout.ts`), không đổi khối nào. */}
        <View style={[styles.topSections, layoutMode === 'twoColumn' && styles.topSectionsRow]}>
          {continueReadingSection && continueReadingSection.kind === 'continueReading' && (
            <Pressable
              style={[styles.continueCard, layoutMode === 'twoColumn' && styles.topSectionHalf]}
              onPress={() => onOpenArticle(continueReadingSection.entry.articleId)}
            >
              <Text style={styles.sectionLabel}>Đang đọc dở</Text>
              {continueReadingSection.article ? (
                <InlineHtmlText
                  html={continueReadingSection.article.titleHtml}
                  style={styles.continueTitle}
                  numberOfLines={2}
                />
              ) : (
                <Text style={styles.continueTitle}>Bài #{continueReadingSection.entry.articleId}</Text>
              )}
              <Text style={styles.continueHint}>Chạm để đọc tiếp đúng chỗ đang dở</Text>
            </Pressable>
          )}

          {offlineReadySection && offlineReadySection.kind === 'offlineReady' && (
            <View style={[styles.offlineRow, layoutMode === 'twoColumn' && styles.topSectionHalf]}>
              <Text style={styles.sectionLabel}>Đã tải sẵn để đọc offline</Text>
              <Text style={styles.offlineText}>
                {offlineReadySection.count} bài
                {offlineReadySection.lastSyncedAt
                  ? ` • Đồng bộ lúc ${formatSyncTime(offlineReadySection.lastSyncedAt)}`
                  : ' • Chưa đồng bộ lần nào'}
              </Text>
            </View>
          )}
        </View>

        {/* Task 315 — khối ④ chạy được ở CẢ hai trạng thái đăng nhập, đúng một nhánh nguồn dữ
            liệu tại một thời điểm (rào an toàn #6). Ô nhập liệu luôn thật, không còn text mời
            đăng nhập đứng thay chức năng khi guest (rào an toàn Guideline 5.1.1(v)). */}
        <View style={styles.searchBlock}>
          <Text style={styles.sectionLabel}>
            {signedIn ? 'Tìm trong bài đã lưu' : 'Tìm trong bài đã tải sẵn'}
          </Text>
          <TextInput
            style={styles.searchInput}
            placeholder={
              signedIn ? 'Tìm theo tiêu đề hoặc nội dung…' : 'Tìm trong bài đã tải sẵn…'
            }
            value={savedSearchQuery}
            onChangeText={setSavedSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {signedIn ? (
            <>
              {savedSearchView.kind === 'noSavedArticles' && (
                <Text style={styles.searchHint}>Bạn chưa lưu bài nào để tìm.</Text>
              )}
              {savedSearchView.kind === 'noMatch' && (
                <Text style={styles.searchHint}>
                  Không tìm thấy bài đã lưu nào khớp “{savedSearchQuery.trim()}”.
                </Text>
              )}
              {savedSearchView.kind === 'results' && (
                <View>
                  {savedSearchView.articles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      post={article}
                      onPress={() => onOpenArticle(article.id)}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {cachedSearchView.kind === 'noCachedArticles' && (
                <Text style={styles.searchHint}>
                  Chưa có bài nào tải sẵn để tìm — kéo để làm mới hoặc chờ đồng bộ nền.
                </Text>
              )}
              {cachedSearchView.kind === 'noMatch' && (
                <Text style={styles.searchHint}>
                  Không tìm thấy bài đã tải sẵn nào khớp “{savedSearchQuery.trim()}”.
                </Text>
              )}
              {cachedSearchView.kind === 'results' && (
                <View>
                  {cachedSearchView.articles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      post={article}
                      onPress={() => onOpenArticle(article.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </View>

      <View style={[styles.tabs, { paddingHorizontal: horizontalPadding }]}>
        <Pressable
          style={[styles.tabButton, tab === 'latest' && styles.tabButtonActive]}
          onPress={() => setTab('latest')}
        >
          <Text style={[styles.tabText, tab === 'latest' && styles.tabTextActive]}>Mới nhất</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'saved' && styles.tabButtonActive]}
          onPress={() => setTab('saved')}
        >
          <Text style={[styles.tabText, tab === 'saved' && styles.tabTextActive]}>
            Đã lưu{savedList.length > 0 ? ` (${savedList.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {showInitialLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {showInitialError && (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPage(1, true)}>
            <Text style={styles.retryText}>Thử lại</Text>
          </Pressable>
        </View>
      )}

      {showEmptySaved && (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            Chưa lưu bài nào. Mở một bài và bấm “Lưu đọc offline” để xem lại khi mất mạng.
          </Text>
        </View>
      )}

      {showList && (
        <FlatList
          // Task 311: `numColumns` của RN chỉ áp dụng lúc mount — đổi `key` theo `listColumns`
          // để buộc remount khi cách xếp đổi (vd xoay iPad giữa split-view rộng/hẹp).
          key={`list-${listColumns}`}
          data={data}
          numColumns={listColumns}
          columnWrapperStyle={
            listColumns > 1
              ? [styles.listColumnWrapper, { paddingHorizontal: horizontalPadding }]
              : undefined
          }
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ArticleRow
              post={item}
              onPress={() => onOpenArticle(item.id)}
              style={listColumns > 1 ? styles.rowHalf : undefined}
            />
          )}
          refreshControl={
            tab === 'latest' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
          onEndReachedThreshold={0.4}
          onEndReached={tab === 'latest' ? onEndReached : undefined}
          ListFooterComponent={
            tab === 'latest' && loading && posts.length > 0 ? (
              <ActivityIndicator style={styles.footerSpinner} />
            ) : null
          }
        />
      )}
    </View>
  );
}

function ArticleRow({
  post,
  onPress,
  style,
}: {
  post: PostSummary | SavedArticle;
  onPress: () => void;
  // Task 311: khi lưới hai cột (iPad), `NewsListScreen` truyền `styles.rowHalf` để mỗi ô
  // chiếm nửa hàng — cùng nội dung/hàng vẽ, chỉ khác bề rộng.
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable style={[styles.row, style]} onPress={onPress}>
      <ArticleImage uri={post.imageUrl} style={styles.thumb} />
      <View style={styles.rowBody}>
        <InlineHtmlText html={post.titleHtml} style={styles.rowTitle} numberOfLines={2} />
        <InlineHtmlText html={post.excerptHtml} style={styles.rowExcerpt} numberOfLines={2} />
        <Text style={styles.rowDate}>{formatVietnameseDate(post.date)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  homeHeader: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  homeHeaderTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#868e96', textTransform: 'uppercase' },
  refreshLink: { color: '#1971c2', fontSize: 14, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#1971c2', marginBottom: 4 },
  // Task 311: bọc khối ①②. Mặc định (single) giữ nguyên xếp chồng có gap dọc như trước;
  // twoColumn (iPad) đổi hướng sang hàng, mỗi khối chiếm nửa (`topSectionHalf`).
  topSections: { gap: 10 },
  topSectionsRow: { flexDirection: 'row' },
  topSectionHalf: { flex: 1 },
  continueCard: {
    backgroundColor: '#eef4fb',
    borderRadius: 10,
    padding: 12,
  },
  continueTitle: { fontSize: 15, fontWeight: '600', color: '#212529', marginBottom: 4 },
  continueHint: { fontSize: 12, color: '#495057' },
  offlineRow: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
  },
  offlineText: { fontSize: 13, color: '#495057' },
  searchBlock: { gap: 6 },
  searchHint: { fontSize: 13, color: '#495057' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#212529',
  },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f1f3f5',
  },
  tabButtonActive: { backgroundColor: '#1971c2' },
  tabText: { fontSize: 14, color: '#495057', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#c0392b', fontSize: 15, textAlign: 'center', marginBottom: 12 },
  emptyText: { color: '#868e96', fontSize: 14, textAlign: 'center' },
  retryButton: { paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#1971c2', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  footerSpinner: { marginVertical: 16 },
  // Task 311: lưới hai cột ở bề rộng iPad — `columnWrapperStyle` canh khoảng cách giữa hai ô
  // cùng hàng, `rowHalf` giới hạn mỗi ô ở nửa bề rộng (FlatList tự chia đều `flex: 1`).
  listColumnWrapper: { gap: 16, paddingHorizontal: 16 },
  rowHalf: { flex: 1, paddingHorizontal: 0 },
  row: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
  thumb: { width: 88, height: 66, borderRadius: 8, marginRight: 12 },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#212529', marginBottom: 4 },
  rowExcerpt: { fontSize: 13, color: '#495057', marginBottom: 4 },
  rowDate: { fontSize: 12, color: '#adb5bd' },
});
