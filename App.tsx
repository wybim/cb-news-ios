import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { accountStore, useAccountState } from './src/state/accountStore';
import { savedArticlesStore } from './src/data/savedArticles';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  const account = useAccountState();

  useEffect(() => {
    void accountStore.hydrate();
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

  return (
    <View style={styles.root}>
      {account.status === 'unknown' && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {account.status === 'signed-out' && <LoginScreen />}
      {account.status === 'signed-in' && <HomeScreen account={account} />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
