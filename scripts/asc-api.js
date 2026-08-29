#!/usr/bin/env node
'use strict';

// Task 274 (BLI 258): tiện ích gọi App Store Connect API — dùng trong
// .github/workflows/release-testflight.yml SAU khi build đã ký số và upload (altool).
// Không liên quan tới Worker thu hồi token Apple (khác hệ thống, khác khoá) — module
// này CHỈ phục vụ việc "đo nền số build hiện có" và "gán bản build mới vào nhóm
// TestFlight", KHÔNG đụng tới đăng nhập/xoá tài khoản của app.
//
// Bí mật: đọc khoá riêng App Store Connect (.p8) từ đường dẫn ASC_PRIVATE_KEY_PATH —
// file này do chính workflow giải mã từ secret ASC_KEY_P8_BASE64 (đã có sẵn từ Task
// 268), KHÔNG phải kho khoá của máy KB. KHÔNG in nội dung khoá hay JWT ra log ở bất kỳ
// đâu trong toàn bộ script này — chỉ in mã trạng thái HTTP và JSON phản hồi của Apple.

const fs = require('fs');
const crypto = require('crypto');

const API_BASE = 'https://api.appstoreconnect.apple.com';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường bắt buộc: ${name}`);
    process.exit(1);
  }
  return value;
}

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * JWT xác thực App Store Connect API (KHÁC client_secret JWT của Worker thu hồi token
 * Apple — hai hệ thống độc lập, chỉ giống cơ chế ký ES256). exp tối đa 20 phút theo quy
 * định Apple; đặt 19 phút cho an toàn. Nguồn: developer.apple.com/documentation/
 * appstoreconnectapi/generating-tokens-for-api-requests.
 */
function makeAscJwt() {
  const keyId = requireEnv('ASC_KEY_ID');
  const issuerId = requireEnv('ASC_ISSUER_ID');
  const privateKeyPath = requireEnv('ASC_PRIVATE_KEY_PATH');
  const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: issuerId, iat: now, exp: now + 19 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${base64Url(Buffer.from(JSON.stringify(header)))}.${base64Url(Buffer.from(JSON.stringify(payload)))}`;
  // dsaEncoding 'ieee-p1363' bắt buộc — JWT ES256 cần r‖s nối liền, KHÁC mặc định DER
  // của node:crypto (đúng bẫy mà chính Worker thu hồi token đã ghi chú tránh).
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64Url(signature)}`;
}

/** Gọi App Store Connect API. Tự sinh JWT mới mỗi lần gọi (poll dài hơn 19 phút vẫn đúng). */
async function ascFetch(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${makeAscJwt()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: resp.status, body };
}

async function timAppIdTheoBundleId(bundleId) {
  const { status, body } = await ascFetch(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  if (status !== 200 || !body || !Array.isArray(body.data) || body.data.length === 0) {
    throw new Error(`Không tìm được app id cho bundleId=${bundleId}: HTTP ${status} ${JSON.stringify(body)}`);
  }
  return body.data[0].id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { requireEnv, ascFetch, timAppIdTheoBundleId, sleep };
