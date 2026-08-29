import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { accountStore, useAccountState } from './src/state/accountStore';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  const account = useAccountState();

  useEffect(() => {
    void accountStore.hydrate();
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
