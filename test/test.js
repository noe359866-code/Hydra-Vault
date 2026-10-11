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
    // 1. REST API eliminada: solo queda POST /api/admin/add
    await test('REST API removed: GET /api/vault and /api/health no longer exist', async () => {
      for (const path of ['/api/vault?id=tt21344706', '/api/health', '/api/stats']) {
        const res = await request(path, { headers: { Accept: 'application/json' } });
        assert.strictEqual(res.statusCode, 404, path);
      }
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

    async function addEntry(body) {
      return request('/api/admin/add', { method: 'POST', headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': config.adminSecret
        }, body });
    }
    const MAGNET = (n) => `magnet:?xt=urn:btih:${String(n).repeat(40).slice(0, 40)}`;

    await test('Admin API: series/drama require season and episode', async () => {
      const noSeason = await addEntry({ title: 'Serie sin temporada', type: 'series', episode: 2, magnet: MAGNET(1) });
      assert.strictEqual(noSeason.statusCode, 400);
      const nothing = await addEntry({ title: 'Drama sin episodio', type: 'drama', magnet: MAGNET(1) });
      assert.strictEqual(nothing.statusCode, 400);
    });

    await test('Admin API: anime requires chapter, season optional', async () => {
      const noChapter = await addEntry({ title: 'Anime sin capítulo', type: 'anime', magnet: MAGNET(2) });
      assert.strictEqual(noChapter.statusCode, 400);
      assert(noChapter.body.error.includes('capítulo'));
      const ok = await addEntry({ title: 'Anime Cap 12', type: 'anime', kitsu_id: '111222', imdb_id: 'tt5550001', episode: 12, magnet: MAGNET(3) });
      assert.strictEqual(ok.statusCode, 201);
      assert.strictEqual(ok.body.data.season, null);
      assert.strictEqual(ok.body.data.episode, 12);
    });

    await test('Admin API: movies drop season/episode', async () => {
      const res = await addEntry({ title: 'Película', type: 'movie', season: 1, episode: 4, episode_title: 'x', magnet: MAGNET(4) });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.season, null);
      assert.strictEqual(res.body.data.episode, null);
      assert.strictEqual(res.body.data.episode_title, null);
    });

    await test('Admin API: stores any audio/subtitle language (Inglés, Chino, Polaco…)', async () => {
      const res = await addEntry({
        title: 'Rare Movie 1987 1080p VO Polaco Sub Eng',
        type: 'movie',
        imdb_id: 'tt5550002',
        magnet: MAGNET('c'),
        quality: '1080p',
        audio_lang: 'Polaco',
        subtitles: 'Inglés / Chino'
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.audio_lang, 'Polaco');
      assert.strictEqual(res.body.data.subtitles, 'Inglés / Chino');
    });

    await test('Stremio: each episode only returns its own stream (no mixing)', async () => {
      await addEntry({ title: 'Mix Show S01E01', type: 'series', imdb_id: 'tt6660001', season: 1, episode: 1, magnet: MAGNET(5) });
      await addEntry({ title: 'Mix Show S01E02', type: 'series', imdb_id: 'tt6660001', season: 1, episode: 2, magnet: MAGNET(6) });
      await addEntry({ title: 'Mix Show S02E01', type: 'series', imdb_id: 'tt6660001', season: 2, episode: 1, magnet: MAGNET(7) });

      const e2 = await request('/stream/series/tt6660001:1:2.json');
      assert.strictEqual(e2.body.streams.length, 1);
      assert(e2.body.streams[0].title.includes('Mix Show S01E02'));
      assert(e2.body.streams[0].title.includes('T1 · E02'));

      const s2 = await request('/stream/series/tt6660001:2:1.json');
      assert.strictEqual(s2.body.streams.length, 1);
      assert(s2.body.streams[0].title.includes('S02E01'));

      const missing = await request('/stream/series/tt6660001:1:9.json');
      assert.deepStrictEqual(missing.body.streams, []);
    });

    await test('Stremio: full-season packs appear after exact episodes', async () => {
      const res = await request('/stream/series/tt21344706:1:5.json');
      assert(res.body.streams.length > 0);
      assert(res.body.streams[0].title.includes('The Glory'));
    });

    await test('Stremio: anime chapters resolve via Kitsu (kitsu:ID:CAP) and IMDb (tt:1:CAP)', async () => {
      const kitsu = await request('/stream/anime/kitsu:111222:12.json');
      assert.strictEqual(kitsu.body.streams.length, 1);
      assert(kitsu.body.streams[0].title.includes('Cap. 12'));
      const imdb = await request('/stream/series/tt5550001:1:12.json');
      assert.strictEqual(imdb.body.streams.length, 1);
      const wrong = await request('/stream/anime/kitsu:111222:11.json');
      assert.deepStrictEqual(wrong.body.streams, []);
    });

    await test('Stremio: anime meta with Kitsu id lists chapters as kitsu:ID:CAP', async () => {
      const res = await request('/meta/anime/kitsu:111222.json');
      assert(Array.isArray(res.body.meta.videos));
      const video = res.body.meta.videos.find(v => v.episode === 12);
      assert(video);
      assert.strictEqual(video.id, 'kitsu:111222:12');
      assert.strictEqual(video.title, 'Capítulo 12');
    });

    await test('Stremio: series meta lists every season/episode in order without duplicates', async () => {
      await addEntry({ title: 'Mix Show S01E01 720p', type: 'series', imdb_id: 'tt6660001', season: 1, episode: 1, quality: '720p', magnet: MAGNET(8) });
      const res = await request('/meta/series/tt6660001.json');
      const ids = res.body.meta.videos.map(v => v.id);
      assert.deepStrictEqual(ids, ['tt6660001:1:1', 'tt6660001:1:2', 'tt6660001:2:1']);
    });

    await test('Stremio: two qualities of the same episode both appear', async () => {
      const res = await request('/stream/series/tt6660001:1:1.json');
      assert.strictEqual(res.body.streams.length, 2);
    });

    await test('Admin API: accepts pasted URLs as IDs and rejects invalid links', async () => {
      const ok = await addEntry({ title: 'URL ids S01E01', type: 'series', season: 1, episode: 1,
        imdb_id: 'https://www.imdb.com/title/tt0903747/?ref_=nv', tmdb_id: 'https://www.themoviedb.org/tv/1396-breaking-bad',
        magnet: MAGNET(9) });
      assert.strictEqual(ok.statusCode, 201);
      assert.strictEqual(ok.body.data.imdb_id, 'tt0903747');
      assert.strictEqual(ok.body.data.tmdb_id, '1396');
      const bad = await addEntry({ title: 'Bad link', type: 'movie', magnet: 'hola' });
      assert.strictEqual(bad.statusCode, 400);
    });

    await test('Admin API: duplicate link for the same episode returns 409', async () => {
      const again = await addEntry({ title: 'URL ids S01E01', type: 'series', season: 1, episode: 1, imdb_id: 'tt0903747', magnet: MAGNET(9) });
      assert.strictEqual(again.statusCode, 409);
      const otherEpisode = await addEntry({ title: 'URL ids S01E02', type: 'series', season: 1, episode: 2, imdb_id: 'tt0903747', magnet: MAGNET(9) });
      assert.strictEqual(otherEpisode.statusCode, 201);
    });

    await test('Stremio catalog: one item per show with a clean name and real poster', async () => {
      const res = await request('/catalog/series/hydra_series.json');
      const items = res.body.metas.filter(m => m.id === 'tt6660001');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, 'Mix Show');
      assert(items[0].poster.includes('metahub.space/poster'));
      const anime = await request('/catalog/anime/hydra_anime.json');
      assert(anime.body.metas.some(m => m.id === 'tt5550001'));
    });

    await test('Stremio: custom_id groups episodes under hydra:<custom_id>', async () => {
      await addEntry({ title: 'Raro S01E01', type: 'drama', custom_id: 'raro-drama', season: 1, episode: 1, magnet: MAGNET('a') });
      await addEntry({ title: 'Raro S01E02', type: 'drama', custom_id: 'raro-drama', season: 1, episode: 2, magnet: MAGNET('b') });
      const catalog = await request('/catalog/series/hydra_dramas.json');
      assert.strictEqual(catalog.body.metas.filter(m => m.id === 'hydra:raro-drama').length, 1);
      const meta = await request('/meta/series/hydra:raro-drama.json');
      assert.deepStrictEqual(meta.body.meta.videos.map(v => v.id), ['hydra:raro-drama:1:1', 'hydra:raro-drama:1:2']);
      const stream = await request('/stream/series/hydra:raro-drama:1:2.json');
      assert.strictEqual(stream.body.streams.length, 1);
      assert(stream.body.streams[0].title.includes('Raro S01E02'));
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

    await test('Admin page is fully local (no Tailwind CDN) and includes the complete form', async () => {
      const res = await request('/admin');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.raw.includes('Hydra Vault'));
      assert(!res.raw.includes('cdn.tailwindcss.com'));
      assert(res.raw.includes('/styles.css'));
      assert(res.raw.includes('name="type" value="anime"'));
      assert(res.raw.includes('Clave de administrador'));
      assert(res.raw.includes('localStorage'));
      assert(res.raw.includes('Subtítulos'));
      assert(res.raw.includes('custom_id'));

      // Listas de idiomas ampliadas: inglés, chino, coreano, portugués, polaco… y opción "Otro idioma…".
      assert(res.raw.includes('<option value="Inglés">'));
      assert(res.raw.includes('<option value="Chino/Sub">'));
      assert(res.raw.includes('<option value="Coreano/Sub">'));
      assert(res.raw.includes('<option value="Portugués">'));
      assert(res.raw.includes('<option value="Polaco">'));
      assert(res.raw.includes('Otro idioma…'));
      assert(res.raw.includes('id="audio_lang_custom"'));
      assert(res.raw.includes('id="subtitles_custom"'));

      const script = await request('/admin.js');
      assert.strictEqual(script.statusCode, 200);
      assert(script.raw.includes("fetch('/api/admin/add'"));
      assert(script.raw.includes('localStorage'));
      assert(script.raw.includes('subtitles: valueOf'));
      assert(script.raw.includes('setLangField'));
      assert(script.raw.includes("setLangField('audio_lang', 'Polaco')"));
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
