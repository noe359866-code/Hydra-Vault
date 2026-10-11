// Configurar el mock de Prowlarr ANTES de cargar la app (config.js lee process.env al requerirse)
process.env.PROWLARR_URL = 'http://127.0.0.1:7098';
process.env.PROWLARR_API_KEY = 'test-prowlarr-key';
process.env.PROWLARR_TIMEOUT_MS = '1200';
process.env.PROWLARR_GRACE_MS = '5000';
process.env.PROWLARR_MIN_SEEDERS = '0';
process.env.PROWLARR_MAX_RESULTS = '12';

const http = require('http');
const assert = require('assert');
const app = require('../src/app');
const config = require('../src/config');
const { parseMagnet } = require('../src/utils/magnet');
const prowlarr = require('../src/services/prowlarr');
const { resolveExternalTitle, clearTitleCache } = require('../src/utils/titleResolver');

const TEST_PORT = 7099;
const MOCK_PROWLARR_PORT = 7098;
let server;
let mockProwlarrServer;
const prowlarrHits = {};

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

  // Mock de Prowlarr: simula /api/v1/search con resultados deterministas
  function handleMockProwlarr(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/v1/search') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
      return;
    }
    if (req.headers['x-api-key'] !== 'test-prowlarr-key') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }

    const key = url.searchParams.get('imdbId') || url.searchParams.get('query') || 'none';
    prowlarrHits[key] = (prowlarrHits[key] || 0) + 1;

    const send = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (key === 'tt8888888') {
      const h1 = 'a'.repeat(40);
      const h2 = 'b'.repeat(40);
      return send([
        {
          title: 'Demo Show S01E02 1080p WEB-DL Dual',
          magnetUrl: `magnet:?xt=urn:btih:${h1}&dn=Demo+Show+S01E02`,
          size: 1500000000, seeders: 120, peers: 12,
          indexer: 'MockIndexer', protocol: 'torrent', publishDate: '2026-10-01T00:00:00Z'
        },
        {
          title: 'Demo Show S01E02 720p HDTV',
          infoHash: h2,
          size: 700000000, seeders: 45, peers: 5,
          indexer: { name: 'MockIndexer2' }, protocol: 'torrent'
        },
        {
          // usenet → debe filtrarse
          title: 'Demo Show S01E02 1080p NZB (usenet)',
          infoHash: 'c'.repeat(40), protocol: 'usenet', seeders: 999
        },
        {
          // sin infohash/magnet → debe filtrarse
          title: 'Demo Show S01E02 broken (no hash)',
          downloadUrl: 'http://example.invalid/file.torrent', protocol: 'torrent', seeders: 50
        },
        {
          // duplicado por infohash → debe deduplicarse
          title: 'Demo Show S01E02 1080p dup',
          infoHash: h1, protocol: 'torrent', seeders: 1
        }
      ]);
    }

    if (key === 'tt7770000') {
      // Búsqueda lenta (2.5s) para probar el timeout + llenado en background
      setTimeout(() => send([{
        title: 'Slow Show 2026 1080p',
        infoHash: 'd'.repeat(40), size: 2000000000, seeders: 33,
        indexer: 'MockIndexer', protocol: 'torrent'
      }]), 2500);
      return;
    }

    return send([]);
  }

  // Start temporary servers
  await new Promise(resolve => {
    mockProwlarrServer = http.createServer(handleMockProwlarr);
    mockProwlarrServer.listen(MOCK_PROWLARR_PORT, '127.0.0.1', resolve);
  });
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

    await test('Stremio: stored season and episode resolve to the correct stream', async () => {
      const res = await request('/stream/series/tt7777777:1:3.json');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.streams));
      assert(res.body.streams.some(stream => stream.title.includes('Twinkling Watermelon')));
    });

    await test('Stremio: meta exposes the stored season and episode', async () => {
      const res = await request('/meta/series/tt7777777.json');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.meta.videos));
      assert(res.body.meta.videos.some(video => video.season === 1 && video.episode === 3));
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

    // 5. Prowlarr: auto-llenado bajo demanda de la base de datos
    await test('Prowlarr: normalizeResults filtra usenet/sin-hash y dedup por infohash', () => {
      const results = prowlarr.normalizeResults([
        { title: 'Pack S01E01 1080p', magnetUrl: `magnet:?xt=urn:btih:${'e'.repeat(40)}`, size: 100, seeders: 10, protocol: 'torrent' },
        { title: 'NZB', infoHash: 'f'.repeat(40), protocol: 'usenet', seeders: 500 },
        { title: 'Sin hash', downloadUrl: 'http://example.invalid/x.torrent', protocol: 'torrent', seeders: 9 },
        { title: 'Dup del primero', infoHash: 'e'.repeat(40), protocol: 'torrent', seeders: 2 }
      ]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].infoHash, 'e'.repeat(40));
      assert(results[0].magnet.startsWith('magnet:?xt=urn:btih:'));

      // Sin magnetUrl se sintetiza un magnet a partir del infohash
      const built = prowlarr.normalizeResults([
        { title: 'Solo hash 720p', infoHash: 'ab'.repeat(20), size: 50, seeders: 3, protocol: 'torrent' }
      ]);
      assert.strictEqual(built.length, 1);
      assert(built[0].magnet.includes('ab'.repeat(20)));
    });

    await test('Prowlarr: buildSearchFromStreamId parsea tt/kitsu/tmdb y rechaza custom', () => {
      const a = prowlarr.buildSearchFromStreamId({ type: 'series', id: 'tt1234567:2:5' });
      assert.strictEqual(a.imdbId, 'tt1234567');
      assert.strictEqual(a.season, 2);
      assert.strictEqual(a.episode, 5);
      assert.strictEqual(a.searchType, 'tvsearch');

      const b = prowlarr.buildSearchFromStreamId({ type: 'movie', id: 'tt7654321' });
      assert.strictEqual(b.searchType, 'movie');
      assert.strictEqual(b.categories[0], 2000);

      const c = prowlarr.buildSearchFromStreamId({ type: 'series', id: 'kitsu:41370:7' });
      assert.strictEqual(c.vaultType, 'anime');
      assert.strictEqual(c.episode, 7);
      assert.strictEqual(c.needsTitle, true);

      const d = prowlarr.buildSearchFromStreamId({ type: 'movie', id: 'tmdb:123:1:1' });
      assert.strictEqual(d.tmdbId, '123');
      assert.strictEqual(d.searchType, 'tvsearch');

      assert.strictEqual(prowlarr.buildSearchFromStreamId({ type: 'movie', id: 'hydra:12' }), null);
      assert.strictEqual(prowlarr.buildSearchFromStreamId({ type: 'movie', id: 'custom-slug-x' }), null);
    });

    await test('Prowlarr: parseEpisodeMeta y sugerencias de calidad/idioma', () => {
      assert.deepStrictEqual(prowlarr.parseEpisodeMeta('Show S02E05 1080p'), { season: 2, episode: 5 });
      assert.deepStrictEqual(prowlarr.parseEpisodeMeta('Show 1x03 WEB'), { season: 1, episode: 3 });
      assert.deepStrictEqual(prowlarr.parseEpisodeMeta('Anime - 12 [1080p]'), { season: 1, episode: 12 });
      assert.strictEqual(prowlarr.parseEpisodeMeta('Show S01 Pack'), null);
      assert.strictEqual(prowlarr.guessQuality('Movie 2160p UHD'), '4K');
      assert.strictEqual(prowlarr.guessQuality('Movie 720p'), '720p');
      assert.strictEqual(prowlarr.guessAudioLang('Show Dual Latino'), 'Dual');
      assert.strictEqual(prowlarr.guessAudioLang('Show SUB ESPAÑOL'), 'Español');
      assert.strictEqual(prowlarr.guessSubtitles('Show sub español'), 'Español');
    });

    await test('Title resolver: Kitsu/AniList con fetch simulado y fallo en silencio', async () => {
      clearTitleCache();
      const fakeKitsu = async () => ({
        ok: true,
        json: async () => ({ data: { attributes: { canonicalTitle: 'Sousou no Frieren' } } })
      });
      const t1 = await resolveExternalTitle({ kind: 'kitsu', externalId: '52299' }, { fetchImpl: fakeKitsu });
      assert.strictEqual(t1, 'Sousou no Frieren');

      const fakeAniList = async () => ({
        ok: true,
        json: async () => ({ data: { Media: { title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey' } } } })
      });
      const t2 = await resolveExternalTitle({ kind: 'anilist', externalId: '154587' }, { fetchImpl: fakeAniList });
      assert.strictEqual(t2, 'Frieren: Beyond Journey');

      const fail = async () => { throw new Error('network down'); };
      const t3 = await resolveExternalTitle({ kind: 'kitsu', externalId: '999' }, { fetchImpl: fail, useCache: false });
      assert.strictEqual(t3, null);
    });

    await test('Prowlarr: /stream con id desconocido auto-llena la BD y devuelve streams', async () => {
      const res = await request('/stream/series/tt8888888:1:2.json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.streams.length, 2);

      const stream = res.body.streams[0];
      assert(stream.title.includes('Demo Show S01E02 1080p WEB-DL Dual'));
      assert(stream.title.includes('Auto-Fill (Prowlarr'));
      assert(stream.title.includes('MockIndexer'));
      assert.strictEqual(stream.infoHash, 'a'.repeat(40));
      assert(Array.isArray(stream.sources) && stream.sources.length > 0);
      // orden: más seeders primero (120 → 45)
      assert.strictEqual(res.body.streams[1].infoHash, 'b'.repeat(40));
    });

    await test('Prowlarr: segunda petición resuelve desde la BD sin repetir la búsqueda', async () => {
      const hitsBefore = prowlarrHits['tt8888888'];
      const res = await request('/stream/series/tt8888888:1:2.json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.streams.length, 2);
      assert.strictEqual(prowlarrHits['tt8888888'], hitsBefore);

      // Las filas auto-llenadas quedan visibles también en el endpoint CF Worker
      const vault = await request('/api/vault?id=tt8888888');
      assert.strictEqual(vault.statusCode, 200);
      assert.strictEqual(vault.body.streams.length, 2);
    });

    await test('Prowlarr: timeout devuelve vacío sin cachear y completa la BD en background', async () => {
      const start = Date.now();
      const res = await request('/stream/movie/tt7770000.json');
      const elapsed = Date.now() - start;

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.streams, []);
      assert.strictEqual(res.headers['cache-control'], 'no-store');
      assert(elapsed < 2200, `el timeout respondió demasiado tarde: ${elapsed}ms`);

      // La búsqueda lenta (2.5s) termina en background y cachea en la BD
      await new Promise(r => setTimeout(r, 3300));

      const retry = await request('/stream/movie/tt7770000.json');
      assert.strictEqual(retry.statusCode, 200);
      assert.strictEqual(retry.body.streams.length, 1);
      assert(retry.body.streams[0].title.includes('Slow Show'));
      assert.strictEqual(prowlarrHits['tt7770000'], 1); // sin re-buscar: salió de la BD
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
    await new Promise(resolve => mockProwlarrServer.close(resolve));
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
