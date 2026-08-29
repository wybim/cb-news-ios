import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Ảnh bài viết có ảnh thay thế (placeholder) khi thiếu ảnh đại diện hoặc tải ảnh lỗi.
 *
 * Task 267, mục 6: quét thật 189/189 bài chuyên mục Tin tức tổng không gặp bài nào thiếu
 * ảnh đại diện (xem report). Component này vẫn PHẢI xử lý đúng ca đó vì API có thể trả bài
 * thiếu ảnh bất kỳ lúc nào (không do component tự suy đoán) — kiểm bằng ca dựng trong
 * `newsApi.test` cách gọi `extractFeaturedImage(undefined)` trả `null`, và ở đây bằng cách
 * ép `uri=null` để xem giao diện không vỡ.
 */
export function ArticleImage({
  uri,
  style,
}: {
  uri: string | null;
  /** Kích thước/bo góc dùng chung cho cả ảnh thật lẫn khối thay thế (chỉ dùng thuộc tính layout). */
  style?: StyleProp<ViewStyle & ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !uri || failed;

  if (showPlaceholder) {
    return (
      <View style={[styles.placeholder, style as StyleProp<ViewStyle>]}>
        <Text style={styles.placeholderIcon}>🖼️</Text>
        <Text style={styles.placeholderText}>Không có ảnh</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style as StyleProp<ImageStyle>}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 22, marginBottom: 4, opacity: 0.6 },
  placeholderText: { fontSize: 11, color: '#868e96' },
});
