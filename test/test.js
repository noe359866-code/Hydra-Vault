const http = require('http');
const assert = require('assert');
const app = require('../src/app');
const config = require('../src/config');
const { parseMagnet, base32ToHex } = require('../src/utils/magnet');

const TEST_PORT = 7099;
let server;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw: data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando batería de pruebas para Hydra Torrents...');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error('    Error:', err.message);
      failed++;
    }
  }

  // Start temporary server
  await new Promise(resolve => {
    server = app.listen(TEST_PORT, '127.0.0.1', resolve);
  });

  try {
    // 1. Magnet Parsing Unit Tests
    await test('Magnet Parser: BTIH 40-char Hex', () => {
      const magnet = 'magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=Test+Title&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';
      const parsed = parseMagnet(magnet);
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.infoHash, 'd624a91a92e105e45a20340b17163c4ff9841f84');
      assert.strictEqual(parsed.dn, 'Test Title');
      assert(parsed.sources.some(s => s.includes('opentrackr.org')));
    });

    await test('Magnet Parser: BTIH 32-char Base32 to Hex Conversion', () => {
      const b32Magnet = 'magnet:?xt=urn:btih:HNQFIU2LHNGE6SKUJB2WMSKUIVGU2USK&dn=Base32Test';
      const parsed = parseMagnet(b32Magnet);
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.infoHash.length, 40);
    });

    await test('Magnet Parser: Direct HTTP/HTTPS stream', () => {
      const direct = 'https://stream.hydratorrents.com/video/drama101.m3u8';
      const parsed = parseMagnet(direct);
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.isDirectUrl, true);
      assert.strictEqual(parsed.url, direct);
    });

    // 2. Stremio Protocol Tests
    await test('Stremio: GET /manifest.json returns valid manifest', async () => {
      const res = await request('/manifest.json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.id, 'community.hydra.torrents');
      assert.strictEqual(res.body.name, 'Hydra Torrents');
      assert(Array.isArray(res.body.resources));
      assert(Array.isArray(res.body.catalogs));
      assert(res.body.idPrefixes.includes('tt'));
      assert(res.body.idPrefixes.includes('kitsu'));
      assert(res.body.idPrefixes.includes('hydra'));
    });

    await test('Stremio: GET /stream/drama/tt21344706.json returns curated stream', async () => {
      const res = await request('/stream/drama/tt21344706.json');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.streams));
      assert(res.body.streams.length > 0);
      const stream = res.body.streams[0];
      assert(stream.name.includes('[Hydra]'));
      assert(stream.title.includes('The Glory'));
      assert(stream.infoHash || stream.url);
    });

    await test('Stremio: GET /stream for nonexistent id returns empty array', async () => {
      const res = await request('/stream/series/nonexistent_id_9999.json');
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.streams, []);
    });

    await test('Stremio: GET /catalog/series/hydra_dramas.json returns metas', async () => {
      const res = await request('/catalog/series/hydra_dramas.json');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.metas));
      assert(res.body.metas.length > 0);
      const meta = res.body.metas[0];
      assert(meta.id);
      assert(meta.name);
      assert(meta.poster);
    });

    await test('Stremio: GET /meta/drama/tt21344706.json returns meta object', async () => {
      const res = await request('/meta/drama/tt21344706.json');
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.meta);
      assert.strictEqual(res.body.meta.name.includes('The Glory'), true);
    });

    // 3. Admin Authentication & API Tests
    await test('API: POST /api/vault without auth returns 401', async () => {
      const res = await request('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { title: 'Test', magnet: 'magnet:?xt=urn:btih:0000', type: 'drama' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('API: POST /api/vault with invalid token returns 403', async () => {
      const res = await request('/api/vault', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-secret-token'
        },
        body: { title: 'Test', magnet: 'magnet:?xt=urn:btih:0000', type: 'drama' }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    let createdId;
    await test('API: POST /api/vault with valid ADMIN_SECRET creates entry adhering to schema', async () => {
      const payload = {
        imdb_id: 'tt9999999',
        tmdb_id: '88888',
        anilist_id: '77777',
        kitsu_id: '66666',
        custom_id: 'hydra-test-custom',
        type: 'drama',
        source_platform: 'Viki',
        title: 'Hydra Test KDrama 1080p Viki Latino',
        magnet: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=TestKDrama&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337',
        quality: '1080p',
        audio_lang: 'Latino',
        size: '2.5 GB',
        seeders: 45
      };

      const res = await request('/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.adminSecret}`
        },
        body: payload
      });

      assert.strictEqual(res.statusCode, 201);
      assert(res.body.data);
      assert(res.body.data.id);
      createdId = res.body.data.id;
      assert.strictEqual(res.body.data.title, payload.title);
      assert.strictEqual(res.body.data.type, 'drama');
      assert.strictEqual(res.body.data.source_platform, 'Viki');
      assert.strictEqual(res.body.data.imdb_id, 'tt9999999');
      assert.strictEqual(res.body.data.quality, '1080p');
      assert.strictEqual(res.body.data.audio_lang, 'Latino');
    });

    await test('API: Stream query resolves newly created entry', async () => {
      const res = await request('/stream/drama/tt9999999.json');
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.streams.length > 0);
      assert.strictEqual(res.body.streams[0].infoHash, 'abcdef1234567890abcdef1234567890abcdef12');
    });

    await test('API: PUT /api/vault/:id updates entry', async () => {
      const res = await request(`/api/vault/${createdId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.adminSecret}`
        },
        body: {
          seeders: 99,
          quality: '4K'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.seeders, 99);
      assert.strictEqual(res.body.data.quality, '4K');
    });

    await test('API: DELETE /api/vault/:id removes entry', async () => {
      const res = await request(`/api/vault/${createdId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${config.adminSecret}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
    });

    await test('API: GET /api/stats returns counts and metrics', async () => {
      const res = await request('/api/stats');
      assert.strictEqual(res.statusCode, 200);
      assert(typeof res.body.total === 'number');
      assert(res.body.byType);
      assert(res.body.byPlatform);
    });

    await test('API: GET /api/health returns health status', async () => {
      const res = await request('/api/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    // 4. Frontend Views
    await test('View: GET / serves landing page HTML', async () => {
      const res = await request('/');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.raw.includes('HYDRA TORRENTS'));
      assert(res.raw.includes('manifest.json'));
    });

    await test('View: GET /admin serves Admin SPA HTML', async () => {
      const res = await request('/admin');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.raw.includes('HYDRA VAULT'));
      assert(res.raw.includes('ADMIN_SECRET'));
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('----------------------------------------------------');
  console.log(`📊 RESULTADOS: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ¡Todas las pruebas pasaron con éxito total!');
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
