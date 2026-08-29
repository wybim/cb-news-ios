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

const PER_PAGE = 10;

type Tab = 'latest' | 'saved';

/**
 * Danh sách bài — giao diện GỐC của app (không WebView), đọc chuyên mục Tin tức tổng qua
 * `newsApi.ts`. Tab "Đã lưu" đọc thẳng từ `savedArticlesStore` (không cần mạng) — đây là phần
 * app làm được mà trang web không làm được (Guideline 4.2.2, xem báo cáo Task 267).
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
