import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { accountStore, useAccountState } from './src/state/accountStore';
import { resolveRootView } from './src/state/accessPolicy';
import { savedArticlesStore } from './src/data/savedArticles';
import { HomeScreen } from './src/screens/HomeScreen';
import { runNewsRefreshCycle } from './src/background/newsRefreshCycle';
import { registerNewsBackgroundTaskAsync } from './src/background/backgroundTask';
import { createForegroundRefreshHandler } from './src/background/appLifecycle';

export default function App() {
  const account = useAccountState();

  useEffect(() => {
    void accountStore.hydrate();
  }, []);

  // Task 305 (BLI 299, AD-18/AD-25): đăng ký ĐÚNG MỘT lượt chạy nền, và chạy ngay MỘT lượt
  // TIỀN CẢNH khi mở app + mỗi khi app quay lại tiền cảnh (AppState → 'active'). Đây là
  // đường bắt buộc để bộ lên lịch thông báo không phụ thuộc riêng vào việc iOS có cấp lượt
  // nền hay không (AD-25) — không đụng màn hình nào, chỉ nối dây ở gốc app.
  useEffect(() => {
    void registerNewsBackgroundTaskAsync();
    void runNewsRefreshCycle();
    const handler = createForegroundRefreshHandler(runNewsRefreshCycle);
    const subscription = AppState.addEventListener('change', handler);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Task 284: kho bài lưu offline giờ tách theo tài khoản, nên phải nạp lại MỖI KHI
    // tài khoản đổi (đăng xuất, đăng nhập tài khoản khác) — không còn nạp một lần lúc
    // khởi động như bản cũ (Task 267). `status === 'unknown'` là lúc accountStore đang tự
    // hydrate từ SecureStore — CHƯA gọi sync để tránh nạp nhầm trước khi biết tài khoản.
    if (account.status === 'signed-in') {
      void savedArticlesStore.syncToAccount({
        provider: account.provider,
        providerUserId: account.providerUserId,
      });
    } else if (account.status === 'signed-out') {
      void savedArticlesStore.syncToAccount(null);
    }
  }, [account]);

  // Task 298 (Guideline 5.1.1(v)): 'home' phủ CẢ chưa từng đăng nhập LẪN vừa đăng xuất —
  // không còn màn LoginScreen chặn toàn màn ở tầng gốc (xem src/state/accessPolicy.ts).
  const rootView = resolveRootView(account);

  return (
    <View style={styles.root}>
      {rootView === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {rootView === 'home' && <HomeScreen account={account} />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
