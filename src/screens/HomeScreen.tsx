import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SignedInAccount } from '../state/accountStore';
import { signOutCurrentSession } from '../auth/signOutSession';
import { deleteAccount } from '../auth/deleteAccount';

export function HomeScreen({ account }: { account: SignedInAccount }) {
  const handleSignOut = () => {
    void signOutCurrentSession();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Xoá tài khoản',
      'Thao tác này xoá toàn bộ dữ liệu tài khoản đã lưu trên máy này (tên hiển thị, ' +
        'trạng thái đăng nhập) và KHÔNG THỂ HOÀN TÁC. CB News không có máy chủ riêng ' +
        'nên tài khoản chỉ tồn tại trên máy — xoá xong sẽ không còn dấu vết nào của ' +
        'tài khoản trên thiết bị này. Bạn có chắc chắn muốn tiếp tục?',
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
    <View style={styles.container}>
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
