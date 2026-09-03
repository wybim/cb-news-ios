import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchPostDetail, NewsApiError, type PostDetail } from '../api/newsApi';
import { savedArticlesStore, useSavedArticles } from '../data/savedArticles';
import { getAllReadingProgress, getReadingProgress, setReadingProgress } from '../data/readingProgress';
import { useAccountState } from '../state/accountStore';
import { isSignedIn } from '../state/accessPolicy';
import { maybeRequestNotificationPermissionAfterReading } from '../state/notificationTiming';
import { computeScrollOffsetFromProgress, computeScrollProgress } from '../state/readingPosition';
import { ArticleImage } from '../components/ArticleImage';
import { InlineHtmlText, RenderedContentHtml } from '../components/RenderedHtml';
import { formatVietnameseDate } from '../utils/formatDate';

/**
 * Màn đọc bài — giao diện GỐC (không WebView). Mở bài luôn thử tải bản mới nhất từ mạng;
 * nếu mất mạng VÀ bài đã được lưu offline trước đó thì hiện bản đã lưu kèm banner báo rõ —
 * đây là phần chứng minh app làm được thứ trang web không làm được (Guideline 4.2.2).
 *
 * HV2 (Task 298, Guideline 5.1.1(v)): đọc toàn văn bài KHÔNG cần đăng nhập — đường tải/hiển
 * thị bài trên KHÔNG có và không được thêm điều kiện theo tài khoản. HV3: chỉ hành động LƯU
 * bài (`handleToggleSave`) mới kiểm `isSignedIn()`, vì lưu bài offline gắn tài khoản (F2).
 *
 * Task 307 (BLI 299, `AD-21`/`F4`): mở bài là điểm chạm ghi/đọc BẢN GHI TRẠNG THÁI ĐỌC
 * (`readingProgress.ts`, phân vùng THIẾT BỊ — chạy được khi CHƯA đăng nhập). Toán cuộn ↔
 * tiến độ nằm ở `readingPosition.ts` (hàm thuần, có phép thử); ở đây chỉ NỐI DÂY vào
 * `ScrollView` — máy KB không dựng được để test JSX này trực tiếp (F6, đúng tiền lệ Task
 * 298). Cùng lúc, đây là điểm chạm MỚI xin quyền thông báo ĐÚNG THỜI ĐIỂM (`F4`/`AD-25`):
 * đọc bản ghi TRƯỚC lần mở này rồi gọi `maybeRequestNotificationPermissionAfterReading` —
 * hàm đó CHỈ GỌI `ensureNotificationPermissionsAsync` của `notifications.ts`, không sửa
 * logic của nó (rào an toàn #5).
 */
export function ArticleScreen({ postId, onBack }: { postId: number; onBack: () => void }) {
  const account = useAccountState();
  const savedMap = useSavedArticles();
  const savedCopy = savedMap[postId] ?? null;
  const isSaved = savedArticlesStore.isSaved(postId);

  const [detail, setDetail] = useState<PostDetail | null>(savedCopy);
  const [loading, setLoading] = useState(!savedCopy);
  const [error, setError] = useState<string | null>(null);
  const [offlineFallback, setOfflineFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPostDetail(postId)
      .then((fresh) => {
        if (cancelled) return;
        setDetail(fresh);
        setOfflineFallback(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const current = savedArticlesStore.getState()[postId] ?? null;
        if (current) {
          setDetail(current);
          setOfflineFallback(true);
        } else {
          setError(err instanceof NewsApiError ? err.message : 'Không tải được bài viết.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Cố ý chỉ phụ thuộc postId: đây là hành vi "mở bài thì thử tải mới" một lần lúc mount,
    // không refetch khi người dùng bấm lưu/bỏ lưu trong lúc đang xem bài.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // Task 307 — vị trí cuộn khôi phục khi mở lại bài (`readingPosition.ts`) + thời điểm xin
  // quyền thông báo (`notificationTiming.ts`). `scrollViewRef` để gọi `scrollTo` sau khi cả
  // layout (chiều cao khung nhìn) LẪN content size (chiều cao toàn bài) đã đo xong — hai sự
  // kiện `onLayout`/`onContentSizeChange` đến KHÔNG theo thứ tự cố định, nên chỉ khôi phục
  // khi cả hai đã có giá trị (`maybeApplyRestore`).
  const scrollViewRef = useRef<ScrollView>(null);
  const layoutHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const restoreProgressRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  const maybeApplyRestore = useCallback(() => {
    if (restoredRef.current) return;
    if (restoreProgressRef.current === null) return;
    if (layoutHeightRef.current === 0 || contentHeightRef.current === 0) return;
    const offset = computeScrollOffsetFromProgress(
      restoreProgressRef.current,
      contentHeightRef.current,
      layoutHeightRef.current,
    );
    scrollViewRef.current?.scrollTo({ y: offset, animated: false });
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    // Bài mới mở — reset toàn bộ trạng thái cuộn/khôi phục của bài TRƯỚC đó.
    layoutHeightRef.current = 0;
    contentHeightRef.current = 0;
    restoreProgressRef.current = null;
    restoredRef.current = false;

    let cancelled = false;
    (async () => {
      // TRƯỚC KHI ghi bất cứ gì cho bài đang mở: bản ghi trạng thái đọc đã có SẴN từ TRƯỚC
      // lần mở này quyết định có xin quyền thông báo hay không (F4/AD-25) — "sau khi đã đọc
      // ít nhất một bài", không phải bài đang mở ngay lúc này.
      const priorEntries = await getAllReadingProgress();
      if (cancelled) return;
      void maybeRequestNotificationPermissionAfterReading(priorEntries);

      // Bản ghi của CHÍNH bài đang mở — nếu có, đó là vị trí cần khôi phục về.
      const ownEntry = await getReadingProgress(postId);
      if (cancelled) return;
      restoreProgressRef.current = ownEntry?.progress ?? null;
      maybeApplyRestore();

      // Đánh dấu bài này ĐÃ MỞ ngay cả khi người dùng không cuộn lấy một lần (bài ngắn vừa
      // một màn hình, hoặc đóng bài ngay) — nếu không, `getAllReadingProgress()` sẽ KHÔNG
      // thấy bài này ở lượt mở KẾ TIẾP (chỉ `onScroll` mới ghi), làm gate quyền thông báo
      // (`F4`) đếm sai "đã đọc bài nào chưa". Giữ nguyên tiến độ cũ nếu đang mở lại, 0 nếu
      // là lần đầu — `onScroll` phía dưới sẽ ghi đè bằng tiến độ thật khi người dùng cuộn.
      void setReadingProgress(postId, ownEntry?.progress ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, maybeApplyRestore]);

  const handleScrollLayout = useCallback(
    (height: number) => {
      layoutHeightRef.current = height;
      maybeApplyRestore();
    },
    [maybeApplyRestore],
  );

  const handleContentSizeChange = useCallback(
    (height: number) => {
      contentHeightRef.current = height;
      maybeApplyRestore();
    },
    [maybeApplyRestore],
  );

  const handleScroll = useCallback(
    (offsetY: number) => {
      const progress = computeScrollProgress(offsetY, contentHeightRef.current, layoutHeightRef.current);
      void setReadingProgress(postId, progress);
    },
    [postId],
  );

  const handleToggleSave = useCallback(async () => {
    if (!detail) return;
    // HV3: chưa đăng nhập → mời đăng nhập TẠI CHỖ (Alert, không điều hướng đi đâu), bỏ qua
    // được, và bỏ qua thì đọc tin tiếp tục bình thường. Không lưu vô danh (F2, rào an toàn 3).
    if (!isSignedIn(account)) {
      Alert.alert(
        'Cần đăng nhập để lưu bài',
        'Bài lưu đọc offline thuộc về tài khoản của bạn. Đăng nhập ở mục Tài khoản để lưu, ' +
          'hoặc bỏ qua và tiếp tục đọc bình thường.',
        [{ text: 'Đã hiểu', style: 'cancel' }],
      );
      return;
    }
    if (isSaved) {
      await savedArticlesStore.removeArticle(postId);
    } else {
      await savedArticlesStore.saveArticle(detail);
      Alert.alert('Đã lưu', 'Bài viết đã được lưu để đọc khi mất mạng.');
    }
  }, [detail, isSaved, postId, account]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Không có dữ liệu bài viết.'}</Text>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backLink}>‹ Danh sách</Text>
        </Pressable>
        <Pressable onPress={handleToggleSave} hitSlop={12}>
          <Text style={styles.saveLink}>{isSaved ? 'Bỏ lưu' : 'Lưu đọc offline'}</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        onLayout={(e) => handleScrollLayout(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => handleContentSizeChange(h)}
        onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={500}
      >
        {offlineFallback && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              Không tải được bản mới — đang hiện bản đã lưu offline.
            </Text>
          </View>
        )}
        <ArticleImage uri={detail.imageUrl} style={styles.heroImage} />
        <InlineHtmlText html={detail.titleHtml} style={styles.title} />
        <Text style={styles.date}>{formatVietnameseDate(detail.date)}</Text>
        <RenderedContentHtml html={detail.contentHtml} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#c0392b', fontSize: 15, textAlign: 'center', marginBottom: 12 },
  backButton: { paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#1971c2', borderRadius: 8 },
  backButtonText: { color: '#fff', fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  backLink: { color: '#1971c2', fontSize: 15, fontWeight: '600' },
  saveLink: { color: '#1971c2', fontSize: 15, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  offlineBanner: {
    backgroundColor: '#fff3bf',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  offlineBannerText: { color: '#8a6d00', fontSize: 13 },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, marginBottom: 14 },
  title: { fontSize: 21, fontWeight: '700', color: '#212529', marginBottom: 6 },
  date: { fontSize: 13, color: '#adb5bd', marginBottom: 16 },
});
