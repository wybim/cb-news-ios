#!/usr/bin/env node
'use strict';

// Task 274 (BLI 258), DoD mục 5+6: gán bản build vừa upload vào nhóm TestFlight "CB News
// Internal Testers" (id 273ab72d-b8f8-41d7-a9cd-78a78f4ee88e). App Store Connect cần
// thời gian XỬ LÝ (processingState) trước khi một build có thể gán vào beta group —
// script này poll tới khi build ở trạng thái VALID, dừng sớm nếu Apple báo FAILED/
// INVALID, và bỏ cuộc có kiểm soát nếu vượt quá thời gian chờ tối đa (không treo job vô
// hạn). Đây là cơ chế chờ nằm TRONG job GitHub Actions (không phải worker KB tự chờ nền).

const { requireEnv, ascFetch, timAppIdTheoBundleId, sleep } = require('./asc-api');

const MAX_ATTEMPTS = 40; // ~40 phút, mỗi lần cách 60s — Apple thường xử lý xong 10-30 phút
const POLL_INTERVAL_MS = 60_000;

async function timBuildDaXuLyXong(appId, buildVersion, marketingVersion) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const path =
      `/v1/builds?filter[app]=${encodeURIComponent(appId)}` +
      `&filter[version]=${encodeURIComponent(buildVersion)}` +
      `&filter[preReleaseVersion.version]=${encodeURIComponent(marketingVersion)}` +
      `&sort=-uploadedDate&limit=1`;
    const { status, body } = await ascFetch(path);
    if (status !== 200) {
      console.log(`[thử ${attempt}/${MAX_ATTEMPTS}] GET /v1/builds -> HTTP ${status}: ${JSON.stringify(body)}`);
    } else {
      const build = body && Array.isArray(body.data) ? body.data[0] : undefined;
      if (build) {
        const state = build.attributes && build.attributes.processingState;
        console.log(`[thử ${attempt}/${MAX_ATTEMPTS}] build id=${build.id} processingState=${state}`);
        if (state === 'VALID') return build;
        if (state === 'FAILED' || state === 'INVALID') {
          throw new Error(`Build ${build.id} kết thúc ở trạng thái ${state} — không thể gán nhóm.`);
        }
      } else {
        console.log(
          `[thử ${attempt}/${MAX_ATTEMPTS}] chưa thấy build version=${buildVersion} ` +
            `(marketing=${marketingVersion}) trên App Store Connect.`,
        );
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Hết thời gian chờ Apple xử lý xong build (đã thử tối đa, không gán được nhóm).');
}

async function ganVaoNhom(betaGroupId, buildId) {
  const { status, body } = await ascFetch(`/v1/betaGroups/${betaGroupId}/relationships/builds`, {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'builds', id: buildId }] }),
  });
  console.log(`POST /v1/betaGroups/${betaGroupId}/relationships/builds -> HTTP ${status} ${JSON.stringify(body)}`);
  if (status !== 204 && status !== 200) {
    throw new Error(`Gán build vào nhóm thất bại: HTTP ${status} ${JSON.stringify(body)}`);
  }
}

(async () => {
  const bundleId = requireEnv('BUNDLE_ID');
  const betaGroupId = requireEnv('BETA_GROUP_ID');
  const buildVersion = requireEnv('BUILD_VERSION');
  const marketingVersion = requireEnv('MARKETING_VERSION');

  console.log(`Tìm app id cho bundleId=${bundleId}...`);
  const appId = await timAppIdTheoBundleId(bundleId);
  console.log(`appId=${appId}. Chờ Apple xử lý xong build version=${buildVersion} (marketing=${marketingVersion})...`);
  const build = await timBuildDaXuLyXong(appId, buildVersion, marketingVersion);
  console.log(`Build đã VALID: id=${build.id}. Gán vào nhóm ${betaGroupId}...`);
  await ganVaoNhom(betaGroupId, build.id);
  console.log('XONG: build đã gán vào nhóm TestFlight Internal Testers.');
})().catch((err) => {
  console.error(`LỖI: ${err.message}`);
  process.exit(1);
});
