import React from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import {
  flattenInline,
  isInlineOnly,
  parseHtml,
  type HtmlNode,
  type InlineSegment,
} from '../utils/htmlParser';
import { ArticleImage } from './ArticleImage';

/**
 * Hiển thị HTML thật (`title.rendered`, `excerpt.rendered`, `content.rendered` của WordPress)
 * bằng component RN gốc (Text/View/Image) — KHÔNG dùng WebView (Guideline 4.2.2), KHÔNG bóc
 * thẻ bằng regex (bẫy brief Task 267). Cây node lấy từ `../utils/htmlParser` (đã kiểm bằng
 * `node` thuần, xem report).
 */

function renderInlineSegments(segments: InlineSegment[], keyPrefix: string): React.ReactNode[] {
  return segments.map((seg, i) => {
    const style: TextStyle[] = [];
    if (seg.bold) style.push(styles.bold);
    if (seg.italic) style.push(styles.italic);
    if (seg.href) style.push(styles.link);
    const href = seg.href;
    return (
      <Text
        key={`${keyPrefix}-${i}`}
        style={style}
        onPress={href ? () => Linking.openURL(href).catch(() => undefined) : undefined}
      >
        {seg.text}
      </Text>
    );
  });
}

/**
 * Hiển thị HTML CHỈ-DÒNG trong một `<Text>` — dùng cho `title.rendered`/`excerpt.rendered`
 * ở hàng danh sách, hỗ trợ `numberOfLines` để cắt bớt.
 */
export function InlineHtmlText({
  html,
  style,
  numberOfLines,
}: {
  html: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const nodes = React.useMemo(() => parseHtml(html), [html]);
  const segments = React.useMemo(() => flattenInline(nodes), [nodes]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {renderInlineSegments(segments, 'inline')}
    </Text>
  );
}

function collapsedText(nodes: HtmlNode[]): string {
  return flattenInline(nodes)
    .map((s) => s.text)
    .join('')
    .trim();
}

/** Vẽ đệ quy danh sách node hỗn hợp (khối lẫn dòng) — xem cấu trúc thật đã đo trong report. */
function renderBlockNodes(nodes: HtmlNode[], keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buffer: HtmlNode[] = [];
  let seq = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const text = collapsedText(buffer);
    if (text.length > 0) {
      const segments = flattenInline(buffer);
      out.push(
        <Text key={`${keyPrefix}-p-${seq}`} style={styles.paragraph}>
          {renderInlineSegments(segments, `${keyPrefix}-p-${seq++}`)}
        </Text>,
      );
    }
    buffer = [];
  };

  for (const node of nodes) {
    if (node.type === 'text') {
      buffer.push(node);
      continue;
    }
    if (isInlineOnly([node])) {
      buffer.push(node);
      continue;
    }

    flushBuffer();

    if (node.tag === 'img') {
      if (node.attrs.src) {
        out.push(
          <ArticleImage key={`${keyPrefix}-img-${seq++}`} uri={node.attrs.src} style={styles.contentImage} />,
        );
      }
      continue;
    }

    if (node.tag === 'ul' || node.tag === 'ol') {
      const items = node.children.filter(
        (c): c is Extract<HtmlNode, { type: 'element' }> => c.type === 'element' && c.tag === 'li',
      );
      out.push(
        <View key={`${keyPrefix}-list-${seq++}`} style={styles.list}>
          {items.map((li, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.bullet}>{node.tag === 'ol' ? `${i + 1}.` : '•'}</Text>
              <View style={styles.listItemBody}>
                {renderBlockNodes(li.children, `${keyPrefix}-li-${i}`)}
              </View>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    if (/^h[1-6]$/.test(node.tag)) {
      if (isInlineOnly(node.children)) {
        out.push(
          <Text key={`${keyPrefix}-h-${seq}`} style={[styles.paragraph, styles.heading]}>
            {renderInlineSegments(flattenInline(node.children), `${keyPrefix}-h-${seq++}`)}
          </Text>,
        );
      } else {
        out.push(
          <View key={`${keyPrefix}-h-${seq++}`}>{renderBlockNodes(node.children, `${keyPrefix}-h`)}</View>,
        );
      }
      continue;
    }

    // div/p/blockquote/figure/section/li lồng/...: không tự thêm khoảng trắng riêng, chỉ đệ
    // quy xuống con — bản thân các thẻ bọc này ở WordPress chỉ để định vị (dir/style canh lề).
    out.push(
      <React.Fragment key={`${keyPrefix}-wrap-${seq++}`}>
        {renderBlockNodes(node.children, `${keyPrefix}-${node.tag}`)}
      </React.Fragment>,
    );
  }
  flushBuffer();
  return out;
}

/** Hiển thị nội dung đầy đủ một bài (`content.rendered`) — màn đọc bài. */
export function RenderedContentHtml({ html }: { html: string }) {
  const nodes = React.useMemo(() => parseHtml(html), [html]);
  const children = React.useMemo(() => renderBlockNodes(nodes, 'root'), [nodes]);
  return <View>{children}</View>;
}

const styles = StyleSheet.create({
  paragraph: { fontSize: 16, lineHeight: 24, color: '#212529', marginBottom: 12 },
  heading: { fontSize: 19, fontWeight: '700', marginTop: 4 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  link: { color: '#1971c2', textDecorationLine: 'underline' },
  contentImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, marginBottom: 12 },
  list: { marginBottom: 12 },
  listRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { width: 20, fontSize: 16, color: '#212529' },
  listItemBody: { flex: 1 },
});
