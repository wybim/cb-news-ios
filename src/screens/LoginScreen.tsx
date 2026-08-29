import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { signInWithApple } from '../auth/appleAuth';
import { signInWithGoogle } from '../auth/googleAuth';
import { isGoogleSignInConfigured } from '../config/env';
import { accountStore } from '../state/accountStore';

export function LoginScreen() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const googleReady = isGoogleSignInConfigured();

  const handleApple = async () => {
    if (busy) return;
    setBusy('apple');
    try {
      const result = await signInWithApple();
      if (result.ok) {
        await accountStore.signIn({
          provider: 'apple',
          displayName: result.displayName,
          providerUserId: result.providerUserId,
        });
      } else if (result.reason === 'unavailable' || result.reason === 'error') {
        Alert.alert('Chưa sẵn sàng', 'Đăng nhập Apple hiện chưa sẵn sàng, thử lại sau.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    if (!googleReady) {
      Alert.alert(
        'Cấu hình chưa sẵn sàng',
        'Đăng nhập Google chưa được cấu hình trên bản build này.',
      );
      return;
    }
    setBusy('google');
    try {
      const result = await signInWithGoogle();
      if (result.ok) {
        await accountStore.signIn({
          provider: 'google',
          displayName: result.displayName,
          providerUserId: result.providerUserId,
        });
      } else if (result.reason === 'error') {
        Alert.alert('Có lỗi', 'Đăng nhập Google thất bại, thử lại sau.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CB News</Text>

      {/* Nút chuẩn của Apple (ASAuthorizationAppleIDButton) — không tự vẽ lại. */}
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8}
        style={styles.appleButton}
        onPress={handleApple}
      />

      {/* Nút chuẩn của Google (GIDSignInButton). */}
      <GoogleSigninButton
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        style={styles.googleButton}
        disabled={!googleReady || busy !== null}
        onPress={handleGoogle}
      />
      {!googleReady && (
        <Text style={styles.notice}>Đăng nhập Google: cấu hình chưa sẵn sàng.</Text>
      )}

      {busy !== null && <ActivityIndicator style={styles.spinner} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 32 },
  appleButton: { width: 230, height: 48, marginBottom: 16 },
  googleButton: { marginBottom: 8 },
  notice: { color: '#8a6d00', fontSize: 13, marginTop: 4, textAlign: 'center' },
  spinner: { marginTop: 16 },
});
