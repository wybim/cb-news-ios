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
    // Bài đã lưu offline (Task 267) phải sẵn sàng trước khi ArticleScreen cần fallback —
    // hydrate song song, không phụ thuộc trạng thái đăng nhập.
    void savedArticlesStore.hydrate();
  }, []);

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
