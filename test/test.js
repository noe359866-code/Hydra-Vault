const http = require('http');
const assert = require('assert');
const app = require('../src/app');
const config = require('../src/config');
const { parseMagnet } = require('../src/utils/magnet');

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
  console.log('🧪 Iniciando batería de pruebas para Hydra Vault Backend...');
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
    // 1. Cloudflare Worker Endpoint: GET /api/vault?id=...
    await test('Cloudflare Worker: GET /api/vault?id=tt21344706 returns formatted streams JSON', async () => {
      const res = await request('/api/vault?id=tt21344706');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.streams));
      assert(res.body.streams.length > 0);

      const stream = res.body.streams[0];
      assert(stream.title.includes('[Hydra Vault ⚡]'));
      assert(stream.title.includes('[Viki]'));
      assert(stream.url.startsWith('magnet:?xt=urn:btih:'));
      assert.strictEqual(stream.details.quality, '1080p');
      assert.strictEqual(stream.details.source, 'Viki');
      assert.strictEqual(stream.details.subtitles, 'Español');
      assert(stream.title.includes('Subs: Español'));
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    await test('Cloudflare Worker: GET /api/vault without id returns 400 error', async () => {
      const res = await request('/api/vault');
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert(res.body.error);
    });

    await test('Cloudflare Worker: GET /api/vault for nonexistent id returns success: true with empty streams array', async () => {
      const res = await request('/api/vault?id=nonexistent_999999');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.streams, []);
    });

    // 2. Private Admin Endpoint: POST /api/admin/add
    await test('Admin API: POST /api/admin/add without x-admin-secret returns 401 Unauthorized', async () => {
      const res = await request('/api/admin/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Test Show',
          magnet: 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
          type: 'drama'
        }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert(res.body.error.includes('Unauthorized'));
    });

    await test('Admin API: POST /api/admin/add with wrong x-admin-secret returns 401 Unauthorized', async () => {
      const res = await request('/api/admin/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-secret': 'invalid_secret_key_123'
        },
        body: {
          title: 'Test Show',
          magnet: 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
          type: 'drama'
        }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    let insertedId;
    await test('Admin API: POST /api/admin/add with valid x-admin-secret inserts into hydra_vault', async () => {
      const payload = {
        imdb_id: 'tt7777777',
        tmdb_id: '123456',
        anilist_id: '54321',
        kitsu_id: '98765',
        custom_id: 'viki-test-kdrama',
        type: 'drama',
        season: 1,
        episode: 3,
        episode_title: 'Prueba episodio tres',
        source_platform: 'Viki',
        title: 'Twinkling Watermelon S01 1080p Viki Latino',
        magnet: 'magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=Twinkling+Watermelon&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337',
        quality: '1080p',
        audio_lang: 'Latino',
        subtitles: 'Español',
        size: '18.2 GB',
        seeders: 55
      };

      const res = await request('/api/admin/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-secret': config.adminSecret
        },
        body: payload
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data);
      assert(res.body.data.id);
      insertedId = res.body.data.id;
      assert.strictEqual(res.body.data.title, payload.title);
      assert.strictEqual(res.body.data.imdb_id, 'tt7777777');
      assert.strictEqual(res.body.data.source_platform, 'Viki');
      assert.strictEqual(res.body.data.quality, '1080p');
      assert.strictEqual(res.body.data.subtitles, 'Español');
      assert.strictEqual(res.body.data.season, 1);
      assert.strictEqual(res.body.data.episode, 3);
      assert.strictEqual(res.body.data.episode_title, 'Prueba episodio tres');
    });

    await test('CRUD route: POST /api/vault is not intercepted by public GET handler', async () => {
      const res = await request('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { title: 'Unauthorized test', type: 'movie', magnet: 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000' } });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('Cloudflare Worker: Queries newly inserted item via GET /api/vault?id=tt7777777', async () => {
      const res = await request('/api/vault?id=tt7777777');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.streams.length, 1);
      assert(res.body.streams[0].title.includes('Twinkling Watermelon'));
      assert(res.body.streams[0].title.includes('[Viki]'));
    });

    // 3. Static web pages: no frontend framework or third-party assets.
    await test('Landing page is served locally without external fonts or scripts', async () => {
      const res = await request('/');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.raw.includes('Hydra Vault'));
      assert(res.raw.includes('/manifest.json'));
      assert(!res.raw.includes('fonts.googleapis.com'));
      assert(!res.raw.includes('tailwindcss.com'));
    });

    await test('Admin page uses Tailwind CDN and includes the complete form', async () => {
      const res = await request('/admin');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.raw.includes('Hydra Vault'));
      assert(res.raw.includes('cdn.tailwindcss.com'));
      assert(res.raw.includes('Clave de administrador'));
      assert(res.raw.includes('localStorage'));
      assert(res.raw.includes('Subtítulos'));
      assert(res.raw.includes('custom_id'));

      const script = await request('/admin.js');
      assert.strictEqual(script.statusCode, 200);
      assert(script.raw.includes("fetch('/api/admin/add'"));
      assert(script.raw.includes('localStorage'));
      assert(script.raw.includes('subtitles: valueOf'));
    });

    // 4. Stremio Manifest & Fallback Routes
    await test('Stremio: GET /manifest.json returns valid manifest', async () => {
      const res = await request('/manifest.json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.id, 'community.hydra.torrents');
      assert(Array.isArray(res.body.resources));
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('----------------------------------------------------');
  console.log(`📊 RESULTADOS: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ¡Todas las pruebas de endpoints pasaron exitosamente!');
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
