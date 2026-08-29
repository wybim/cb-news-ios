#!/usr/bin/env node
'use strict';

// Task 274 (BLI 258), DoD mục 1 "đo nền": liệt kê build hiện có trên App Store Connect
// TRƯỚC khi build bản mới — bằng chứng thật (không suy diễn từ mã nguồn) cho số build
// đang có và buildNumber từng bản, chạy sớm trong release-testflight.yml (ngay sau khi
// giải mã khoá ASC, trước bước xcodebuild archive tốn thời gian) để phát hiện sớm nếu
// xác thực JWT sai, tránh tốn phút runner macOS cho một lần chạy chắc chắn hỏng ở cuối.

const { requireEnv, ascFetch, timAppIdTheoBundleId } = require('./asc-api');

(async () => {
  const bundleId = requireEnv('BUNDLE_ID');
  console.log(`[đo nền] Tìm app id cho bundleId=${bundleId}...`);
  const appId = await timAppIdTheoBundleId(bundleId);
  console.log(`[đo nền] appId=${appId}`);

  const { status, body } = await ascFetch(
    `/v1/builds?filter[app]=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=20&fields%5Bbuilds%5D=version,processingState,uploadedDate`,
  );
  if (status !== 200) {
    console.error(`[đo nền] GET /v1/builds thất bại: HTTP ${status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  const builds = (body && body.data) || [];
  console.log(`[đo nền] Số build hiện có trên App Store Connect: ${builds.length}`);
  for (const b of builds) {
    console.log(
      `[đo nền] build id=${b.id} version(CFBundleVersion)=${b.attributes?.version} ` +
        `processingState=${b.attributes?.processingState} uploadedDate=${b.attributes?.uploadedDate}`,
    );
  }
})().catch((err) => {
  console.error(`[đo nền] LỖI: ${err.message}`);
  process.exit(1);
});
