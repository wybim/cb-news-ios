import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchNewsPage, NewsApiError, type PostSummary } from '../api/newsApi';
import { ArticleImage } from '../components/ArticleImage';
import { InlineHtmlText } from '../components/RenderedHtml';
import { formatVietnameseDate } from '../utils/formatDate';
import { useSavedArticles, type SavedArticle } from '../data/savedArticles';
import { loadHomeSectionsData } from '../data/homeData';
import { buildHomeSections, formatSyncTime, type HomeSectionsInput } from '../state/homeSections';
import { triggerManualRefresh } from '../background/manualRefresh';

const PER_PAGE = 10;

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
 */
export function NewsListScreen({ onOpenArticle }: { onOpenArticle: (postId: number) => void }) {
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
      const result = await fetchNewsPage(nextPage, PER_PAGE);
      setPosts((prev) => (replace ? result.posts : [...prev, ...result.posts]));
      setPage(result.page);
      // Đọc totalPages TỪ CHÍNH lần gọi này mỗi lần — không hard-code (bẫy brief Task 267).
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof NewsApiError ? err.message : 'Có lỗi khi tải danh sách bài.');
    } finally {
      setLoading(false);
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

  const homeSections = useMemo(() => buildHomeSections(homeData ?? EMPTY_HOME_DATA), [homeData]);
  const continueReadingSection = homeSections.find((s) => s.kind === 'continueReading');
  const offlineReadySection = homeSections.find((s) => s.kind === 'offlineReady');

  // Nút "Làm mới" thủ công (F5/AD-18): gọi ĐÚNG MỘT chu trình đã có qua `manualRefresh.ts`
  // (KHÔNG dựng chu trình thứ hai), rồi nạp lại dữ liệu trên màn — cả danh sách LẪN 3 khối
  // home, vì chu trình đó có thể vừa đổi cache offline/mốc đồng-bộ (khối ②).
  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await triggerManualRefresh();
    } finally {
      setManualRefreshing(false);
    }
    await Promise.all([loadPage(1, true), loadHomeData()]);
  }, [loadPage, loadHomeData]);

  const savedList = useMemo<SavedArticle[]>(
    () => Object.values(savedMap).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    [savedMap],
  );

  const showInitialLoading = tab === 'latest' && loading && posts.length === 0 && !error;
  const showInitialError = tab === 'latest' && error !== null && posts.length === 0;
  const showEmptySaved = tab === 'saved' && savedList.length === 0;
  const data: Array<PostSummary | SavedArticle> = tab === 'latest' ? posts : savedList;
  const showList = !showInitialLoading && !showInitialError && !showEmptySaved;

  return (
    <View style={styles.container}>
      <View style={styles.homeHeader}>
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

        {continueReadingSection && continueReadingSection.kind === 'continueReading' && (
          <Pressable
            style={styles.continueCard}
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
          <View style={styles.offlineRow}>
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

      <View style={styles.tabs}>
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
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ArticleRow post={item} onPress={() => onOpenArticle(item.id)} />}
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
}: {
  post: PostSummary | SavedArticle;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
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
  row: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
  thumb: { width: 88, height: 66, borderRadius: 8, marginRight: 12 },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#212529', marginBottom: 4 },
  rowExcerpt: { fontSize: 13, color: '#495057', marginBottom: 4 },
  rowDate: { fontSize: 12, color: '#adb5bd' },
});
