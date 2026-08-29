/**
 * Bộ phân tích HTML nhỏ, tự viết — dùng cho `title.rendered`, `excerpt.rendered`,
 * `content.rendered` của WordPress (Task 267). CHỦ ĐÍCH không dùng regex để bóc/xoá thẻ:
 * hàm dưới đây dựng một CÂY thẻ thật (tag, thuộc tính, con), regex chỉ dùng để TÁCH TOKEN
 * (mở thẻ/đóng thẻ/văn bản) — khác hẳn kiểu `html.replace(/<[^>]+>/g, '')` vốn phá cấu trúc
 * và không phân biệt được `<strong>` với văn bản thường (bẫy brief đã cảnh báo).
 *
 * File này KHÔNG import React/React Native — để test được bằng `node` thuần sau khi biên
 * dịch bằng `tsc` (xem newsApi.test.ts cùng đợt).
 *
 * Phạm vi: đủ dùng cho HTML do WordPress sinh ra (thẻ lồng nhau hợp lệ), KHÔNG phải một
 * trình phân tích HTML5 đầy đủ (không xử lý HTML lỗi/thiếu thẻ đóng theo thuật toán phục hồi
 * của trình duyệt thật).
 */

export type HtmlElementNode = {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
};
export type HtmlTextNode = { type: 'text'; value: string };
export type HtmlNode = HtmlElementNode | HtmlTextNode;

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  reg: '®',
};

/** Giải mã thực thể HTML (`&amp;`, `&#39;`, `&#x27;`...) trong văn bản thuần đã tách token. */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, ent: string) => {
    if (ent[0] === '#') {
      const isHex = ent[1] === 'x' || ent[1] === 'X';
      const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const key = ent.toLowerCase();
    return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
  });
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[2] ?? '';
    attrs[name] = decodeHtmlEntities(value);
  }
  return attrs;
}

// Token: mở thẻ (<tag attrs>), đóng thẻ (</tag>), tự đóng (<tag/>), comment (<!-- -->), hoặc văn bản.
const TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** Phân tích một chuỗi HTML thành cây node. Trả về danh sách node cấp cao nhất. */
export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlElementNode = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: HtmlElementNode[] = [root];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string) => {
    if (!raw) return;
    const value = decodeHtmlEntities(raw);
    if (value.length === 0) return;
    stack[stack.length - 1].children.push({ type: 'text', value });
  };

  while ((match = TOKEN_RE.exec(html))) {
    if (match.index > lastIndex) {
      pushText(html.slice(lastIndex, match.index));
    }
    lastIndex = TOKEN_RE.lastIndex;

    const full = match[0];
    if (full.startsWith('<!--')) continue; // bỏ comment

    const isClose = match[1] === '/';
    const tag = match[2].toLowerCase();
    const attrsRaw = match[3] ?? '';

    if (isClose) {
      // Đóng thẻ gần nhất khớp tên; nếu không khớp thẻ nào đang mở thì bỏ qua token này
      // (phục hồi đơn giản cho HTML hơi lỗi, không phải bug — thà mất một thẻ còn hơn vỡ cây).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const selfClosing = attrsRaw.trimEnd().endsWith('/') || VOID_TAGS.has(tag);
    const attrs = parseAttrs(selfClosing ? attrsRaw.trimEnd().replace(/\/$/, '') : attrsRaw);
    const node: HtmlElementNode = { type: 'element', tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (lastIndex < html.length) pushText(html.slice(lastIndex));

  return root.children;
}

export type InlineSegment = { text: string; bold?: boolean; italic?: boolean; href?: string };

const INLINE_ONLY_TAGS = new Set(['a', 'strong', 'b', 'em', 'i', 'span', 'u', 'sub', 'sup', 'mark', 'small']);

/** Có phải node chỉ chứa nội dung dòng (không có block/ảnh) — dùng để chọn đường vẽ nhanh. */
export function isInlineOnly(nodes: HtmlNode[]): boolean {
  return nodes.every((node) => {
    if (node.type === 'text') return true;
    if (node.tag === 'br') return true;
    if (!INLINE_ONLY_TAGS.has(node.tag)) return false;
    return isInlineOnly(node.children);
  });
}

/**
 * Làm phẳng một cây node CHỈ-DÒNG (xem isInlineOnly) thành danh sách đoạn văn bản kèm định
 * dạng (đậm/nghiêng/link) — dùng cho `title.rendered`/`excerpt.rendered` hiển thị trong một
 * dòng `<Text numberOfLines>`. Ảnh và các thẻ khối bị bỏ qua nếu lỡ có (an toàn, không vỡ).
 */
export function flattenInline(nodes: HtmlNode[]): InlineSegment[] {
  const out: InlineSegment[] = [];
  const walk = (list: HtmlNode[], bold: boolean, italic: boolean, href: string | undefined) => {
    for (const node of list) {
      if (node.type === 'text') {
        if (node.value) out.push({ text: node.value, bold: bold || undefined, italic: italic || undefined, href });
        continue;
      }
      if (node.tag === 'br') {
        out.push({ text: '\n' });
        continue;
      }
      if (node.tag === 'img') continue;
      const nextBold = bold || node.tag === 'strong' || node.tag === 'b';
      const nextItalic = italic || node.tag === 'em' || node.tag === 'i';
      const nextHref = node.tag === 'a' ? node.attrs.href : href;
      walk(node.children, nextBold, nextItalic, nextHref);
    }
  };
  walk(nodes, false, false, undefined);
  return out;
}

/** Tiện ích: HTML dòng → chuỗi thuần (giữ nguyên nghĩa Unicode, không dùng để hiển thị định dạng). */
export function inlineTextOnly(html: string): string {
  return flattenInline(parseHtml(html))
    .map((seg) => seg.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
