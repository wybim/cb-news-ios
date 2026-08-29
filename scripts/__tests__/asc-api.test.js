'use strict';

// Task 274: kiểm cơ chế ký JWT App Store Connect và cách gọi fetch của scripts/asc-api.js
// TRƯỚC khi chạy thật trên runner macOS — một lỗi ở đây (vd sai dsaEncoding, sai URL)
// mới phát hiện lúc chạy workflow thật sẽ tốn phút runner macOS vô ích. Dùng khoá EC tự
// sinh (KHÔNG phải khoá Apple thật) chỉ để kiểm cơ chế ký/giải mã JWT không văng lỗi.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('scripts/asc-api.js', () => {
  let tmpKeyPath;
  let ascApi;

  beforeAll(() => {
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    tmpKeyPath = path.join(os.tmpdir(), `test-asc-key-${Date.now()}.p8`);
    fs.writeFileSync(tmpKeyPath, privateKey);

    process.env.ASC_KEY_ID = 'TESTKEYID';
    process.env.ASC_ISSUER_ID = 'test-issuer-id';
    process.env.ASC_PRIVATE_KEY_PATH = tmpKeyPath;

    jest.resetModules();
    ascApi = require('../asc-api');
  });

  afterAll(() => {
    fs.rmSync(tmpKeyPath, { force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ascFetch() ký được JWT ES256 (P1363) không văng lỗi, gọi đúng URL + Bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'app-123' }] }),
    });
    global.fetch = fetchMock;

    const { status, body } = await ascApi.ascFetch('/v1/apps?filter[bundleId]=com.cbcentres.cbnews');

    expect(status).toBe(200);
    expect(body).toEqual({ data: [{ id: 'app-123' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=com.cbcentres.cbnews');
    expect(options.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    // JWT có đúng 3 phần base64url, payload giải mã ra đúng iss/aud khai báo.
    const jwt = options.headers.Authorization.replace('Bearer ', '');
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    expect(payload).toEqual(
      expect.objectContaining({ iss: 'test-issuer-id', aud: 'appstoreconnect-v1' }),
    );
  });

  it('timAppIdTheoBundleId() lấy đúng id từ data[0], throw rõ ràng khi rỗng', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ data: [{ id: 'app-999' }] }) })
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ data: [] }) });

    await expect(ascApi.timAppIdTheoBundleId('com.cbcentres.cbnews')).resolves.toBe('app-999');
    await expect(ascApi.timAppIdTheoBundleId('com.cbcentres.cbnews')).rejects.toThrow(
      /Không tìm được app id/,
    );
  });
});
