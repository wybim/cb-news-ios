import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchPostDetail, NewsApiError, type PostDetail } from '../api/newsApi';
import { savedArticlesStore, useSavedArticles } from '../data/savedArticles';
import { ArticleImage } from '../components/ArticleImage';
import { InlineHtmlText, RenderedContentHtml } from '../components/RenderedHtml';
import { formatVietnameseDate } from '../utils/formatDate';

/**
 * Màn đọc bài — giao diện GỐC (không WebView). Mở bài luôn thử tải bản mới nhất từ mạng;
 * nếu mất mạng VÀ bài đã được lưu offline trước đó thì hiện bản đã lưu kèm banner báo rõ —
 * đây là phần chứng minh app làm được thứ trang web không làm được (Guideline 4.2.2).
 */
export function ArticleScreen({ postId, onBack }: { postId: number; onBack: () => void }) {
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

  const handleToggleSave = useCallback(async () => {
    if (!detail) return;
    if (isSaved) {
      await savedArticlesStore.removeArticle(postId);
    } else {
      await savedArticlesStore.saveArticle(detail);
      Alert.alert('Đã lưu', 'Bài viết đã được lưu để đọc khi mất mạng.');
    }
  }, [detail, isSaved, postId]);

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
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
