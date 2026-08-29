import React, { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { SignedInAccount } from '../state/accountStore';
import { signOutCurrentSession } from '../auth/signOutSession';
import { deleteAccount } from '../auth/deleteAccount';
import { NewsListScreen } from './NewsListScreen';
import { ArticleScreen } from './ArticleScreen';

/**
 * Shell điều hướng nội bộ sau đăng nhập — tin tức ↔ đọc bài ↔ tài khoản. Không dùng thư viện
 * điều hướng (react-navigation...): chỉ 3 màn, một state cục bộ là đủ, tránh thêm phụ thuộc
 * nặng (react-native-screens, gesture-handler...) chưa cần thiết ở quy mô app này (Task 267).
 */
type Route = { name: 'news' } | { name: 'article'; postId: number } | { name: 'account' };

export function HomeScreen({ account }: { account: SignedInAccount }) {
  const [route, setRoute] = useState<Route>({ name: 'news' });

  return (
    <SafeAreaView style={styles.root}>
      {route.name !== 'account' && (
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>CB News</Text>
          <Pressable onPress={() => setRoute({ name: 'account' })} hitSlop={12}>
            <Text style={styles.accountLink}>Tài khoản</Text>
          </Pressable>
        </View>
      )}

      {route.name === 'news' && (
        <NewsListScreen onOpenArticle={(postId) => setRoute({ name: 'article', postId })} />
      )}

      {route.name === 'article' && (
        <ArticleScreen postId={route.postId} onBack={() => setRoute({ name: 'news' })} />
      )}

      {route.name === 'account' && (
        <AccountPanel account={account} onBack={() => setRoute({ name: 'news' })} />
      )}
    </SafeAreaView>
  );
}

function AccountPanel({ account, onBack }: { account: SignedInAccount; onBack: () => void }) {
  const handleSignOut = () => {
    void signOutCurrentSession();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Xoá tài khoản',
      'Thao tác này xoá toàn bộ dữ liệu đã lưu trên máy này (tên hiển thị, trạng thái đăng ' +
        'nhập, VÀ mọi bài đã lưu đọc offline) và KHÔNG THỂ HOÀN TÁC. CB News không có máy chủ ' +
        'riêng nên tài khoản chỉ tồn tại trên máy — xoá xong sẽ không còn dấu vết nào của tài ' +
        'khoản trên thiết bị này. Bạn có chắc chắn muốn tiếp tục?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá tài khoản',
          style: 'destructive',
          onPress: () => {
            void deleteAccount();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.accountContainer}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.accountBackRow}>
        <Text style={styles.accountBackLink}>‹ Quay lại tin tức</Text>
      </Pressable>

      <View style={styles.accountBody}>
        <Text style={styles.title}>Xin chào, {account.displayName}</Text>
        <Text style={styles.meta}>
          Đăng nhập bằng {account.provider === 'apple' ? 'Apple' : 'Google'}
        </Text>

        <Pressable style={styles.button} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Đăng xuất</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.dangerButton]} onPress={confirmDelete}>
          <Text style={[styles.buttonText, styles.dangerText]}>Xoá tài khoản</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  appTitle: { fontSize: 18, fontWeight: '700', color: '#212529' },
  accountLink: { color: '#1971c2', fontSize: 15, fontWeight: '600' },
  accountContainer: { flex: 1 },
  accountBackRow: { paddingHorizontal: 16, paddingVertical: 12 },
  accountBackLink: { color: '#1971c2', fontSize: 15, fontWeight: '600' },
  accountBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  meta: { fontSize: 14, color: '#666', marginBottom: 32 },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#eee',
    marginBottom: 12,
    width: 220,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '500' },
  dangerButton: { backgroundColor: '#fdecea' },
  dangerText: { color: '#c0392b' },
});
