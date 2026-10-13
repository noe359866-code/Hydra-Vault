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

    await test('Admin API: same link may repeat as another version (different audio/subs/quality)', async () => {
      const base = { title: 'Version Show S01E01', type: 'series', imdb_id: 'tt7770001', season: 1, episode: 1, magnet: MAGNET('bc') };

      const v1 = await addEntry({ ...base, audio_lang: 'Latino', subtitles: 'Español' });
      assert.strictEqual(v1.statusCode, 201);

      // El mismo enlace y episodio con OTRO audio/subs → otra versión, se permite.
      const v2 = await addEntry({ ...base, title: 'Version Show S01E01 Dual', audio_lang: 'Dual Audio', subtitles: 'Español / Inglés' });
      assert.strictEqual(v2.statusCode, 201);

      // El mismo enlace y episodio con la MISMA versión pero otra calidad → también se permite.
      const v3 = await addEntry({ ...base, title: 'Version Show S01E01 Remux', quality: 'Remux', audio_lang: 'Latino', subtitles: 'Español' });
      assert.strictEqual(v3.statusCode, 201);

      // La versión exacta repetida (todo igual) sigue bloqueada para cortar el doble clic.
      const again = await addEntry({ ...base, audio_lang: 'Latino', subtitles: 'Español' });
      assert.strictEqual(again.statusCode, 409);
      assert(again.body.error.includes('versión'));

      // Las 3 versiones conviven como streams del mismo episodio en Stremio.
      const stream = await request('/stream/series/tt7770001:1:1.json');
      assert.strictEqual(stream.body.streams.length, 3);

      // El catálogo sigue mostrando el título una sola vez.
      const catalog = await request('/catalog/series/hydra_series.json');
      assert.strictEqual(catalog.body.metas.filter(m => m.id === 'tt7770001').length, 1);
    });

    // 2b. Gestión de datos: listar/buscar y eliminar los registros seleccionados.
    await test('Admin API: GET /api/admin/list requires x-admin-secret', async () => {
      const res = await request('/api/admin/list');
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert(res.body.error.includes('Unauthorized'));
    });

    await test('Admin API: GET /api/admin/list searches, filters by type and paginates', async () => {
      const res = await request('/api/admin/list?search=Twinkling', {
        headers: { 'x-admin-secret': config.adminSecret }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.data.items));
      assert(res.body.data.items.some(item => item.title.includes('Twinkling')));
      assert(res.body.data.total >= 1);
      assert.strictEqual(res.body.data.page, 1);
      assert(res.body.data.pages >= 1);

      const movies = await request('/api/admin/list?type=movie&limit=5', {
        headers: { 'x-admin-secret': config.adminSecret }
      });
      assert.strictEqual(movies.statusCode, 200);
      assert(movies.body.data.items.every(item => item.type === 'movie'));
      assert.strictEqual(movies.body.data.limit, 5);

      const badType = await request('/api/admin/list?type=xxx', {
        headers: { 'x-admin-secret': config.adminSecret }
      });
      assert.strictEqual(badType.statusCode, 400);
    });

    await test('Admin API: POST /api/admin/delete requires x-admin-secret and valid ids', async () => {
      const unauthorized = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { ids: [1] }
      });
      assert.strictEqual(unauthorized.statusCode, 401);

      const empty = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: { ids: [] }
      });
      assert.strictEqual(empty.statusCode, 400);

      const badId = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: { ids: ['abc'] }
      });
      assert.strictEqual(badId.statusCode, 400);

      const noIds = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: {}
      });
      assert.strictEqual(noIds.statusCode, 400);
    });

    await test('Admin API: POST /api/admin/delete removes only the selected records', async () => {
      const a = await addEntry({ title: 'Borrar A S01E01', type: 'series', season: 1, episode: 1, magnet: MAGNET('e') });
      const b = await addEntry({ title: 'Borrar B S01E01', type: 'series', season: 1, episode: 1, magnet: MAGNET('f') });
      const keep = await addEntry({ title: 'Conservar C S01E01', type: 'series', season: 1, episode: 1, magnet: MAGNET('d') });
      assert.strictEqual(a.statusCode, 201);
      assert.strictEqual(b.statusCode, 201);
      assert.strictEqual(keep.statusCode, 201);
      const ids = [a.body.data.id, b.body.data.id];

      const res = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: { ids }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.deleted, 2);
      assert.deepStrictEqual([...res.body.ids].sort(), [...ids].sort());

      const list = await request('/api/admin/list?search=Borrar', {
        headers: { 'x-admin-secret': config.adminSecret }
      });
      assert.strictEqual(list.body.data.items.length, 0);

      const stillThere = await request('/api/admin/list?search=Conservar', {
        headers: { 'x-admin-secret': config.adminSecret }
      });
      assert.strictEqual(stillThere.body.data.items.length, 1);
      assert.strictEqual(stillThere.body.data.items[0].id, keep.body.data.id);
    });

    await test('Admin API: POST /api/admin/delete accepts a single { id } and unknown ids delete nothing', async () => {
      const created = await addEntry({ title: 'Borrar por id S01E01', type: 'series', season: 1, episode: 1, magnet: MAGNET('ab') });
      assert.strictEqual(created.statusCode, 201);

      const res = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: { id: created.body.data.id }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.deleted, 1);
      assert.deepStrictEqual(res.body.ids, [created.body.data.id]);

      const ghost = await request('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
        body: { ids: [999999] }
      });
      assert.strictEqual(ghost.statusCode, 200);
      assert.strictEqual(ghost.body.deleted, 0);
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

    await test('Admin page includes the data manager (search, select and delete)', async () => {
      const res = await request('/admin');
      assert(res.raw.includes('Tus datos'));
      assert(res.raw.includes('id="data-search"'));
      assert(res.raw.includes('id="data-select-all"'));
      assert(res.raw.includes('id="data-delete-selected"'));
      assert(res.raw.includes('Eliminar seleccionados'));
      assert(res.raw.includes('Seleccionar todo'));

      const script = await request('/admin.js');
      assert(script.raw.includes("fetch('/api/admin/delete'"));
      assert(script.raw.includes('/api/admin/list?'));
      assert(script.raw.includes('deleteDataRows'));
      assert(script.raw.includes('window.confirm'));
    });

    // ------------------------------------------------------------------
    // 5. 🌐 Scrapers: buscador de webs torrent en español
    // ------------------------------------------------------------------
    await test('Scrapers: filtro de idioma SOLO acepta habla hispana', async () => {
      const { evaluateSpanish } = require('../src/scrapers/language');

      // Aceptados: castellano, latino, dual, VOSE, Spanish-English…
      const accepted = [
        'El complejo BDrip XviD Castellano',
        'Moana 2026 1080p Latino-Inglés',
        'La guerra de los mundos 720p VOSE',
        'Valkiria (2008).BDrip 1080p (Spanish-English+Subs)',
        'Moana.2026.WEB-DL.1080p-Dual-Lat'
      ];
      for (const text of accepted) {
        assert.strictEqual(evaluateSpanish(text).accepted, true, `debería aceptar: ${text}`);
      }

      // Rechazados: inglés sin subtítulos, multi sin español, francés…
      const rejected = [
        'The Gentlemen 2024 S02E06 1080p HEVC x265-MeGusta',
        'Silo S03E10 FINAL MULTI 1080p WEB H264-HiggsBoson',
        '[SubsPlease] Clevatess S2 - 09 (1080p)',
        'Movie 2023 1080p BluRay TrueFrench'
      ];
      for (const text of rejected) {
        assert.strictEqual(evaluateSpanish(text).accepted, false, `debería rechazar: ${text}`);
      }

      // Los sitios de la escena española se asumen en español por definición.
      assert.strictEqual(
        evaluateSpanish('El Visitante [BluRay-1080p] [DonTorrent]', { assumeSpanish: true }).accepted,
        true,
        'sitio español por definición'
      );
      // VOSE se puede desactivar por configuración.
      assert.strictEqual(
        evaluateSpanish('La guerra de los mundos 720p VOSE', { allowVose: false }).accepted,
        false,
        'VOSE desactivado'
      );
    });

    await test('Scrapers: parser de temporada/episodio/capítulos y packs', async () => {
      const { parseSeasonEpisode } = require('../src/scrapers/language');
      assert.deepStrictEqual(parseSeasonEpisode('Boston Blue S01E02 HDTV'), { season: 1, episode: 2, isPack: false });
      assert.deepStrictEqual(parseSeasonEpisode('Boston Blue 1x2 HDTV'), { season: 1, episode: 2, isPack: false });
      assert.deepStrictEqual(parseSeasonEpisode('Serie Cap. 1-15 [HDTV]'), { season: null, episode: null, isPack: true });
      assert.deepStrictEqual(parseSeasonEpisode('Boston-Blue-1-Temporada'), { season: 1, episode: null, isPack: true });
      assert.deepStrictEqual(parseSeasonEpisode('Temporada 1 Cap 2 HDTV'), { season: 1, episode: 2, isPack: false });
      assert.deepStrictEqual(parseSeasonEpisode('[SubsPlease] One Piece - 1176 (1080p)'), { season: null, episode: 1176, isPack: false });
    });

    await test('Scrapers: .torrent → magnet (bencode + infohash SHA-1)', async () => {
      const crypto = require('crypto');
      const { parseTorrentBuffer, buildMagnet } = require('../src/scrapers/torrent');
      const bstr = s => Buffer.byteLength(s) + ':' + s;
      const name = 'Mi Movie 2024 1080p Latino';
      const info = 'd6:lengthi12345e4:name' + bstr(name) + '12:piece lengthi262144e6:pieces9:binary123e';
      const announce = 'udp://tracker.opentrackr.org:1337';
      const torrent = Buffer.from('d8:announce' + bstr(announce) + '4:info' + info + 'e');

      const parsed = parseTorrentBuffer(torrent);
      const expected = crypto.createHash('sha1').update(Buffer.from(info)).digest('hex');
      assert.strictEqual(parsed.infoHash, expected);
      assert.strictEqual(parsed.name, name);
      assert.strictEqual(parsed.length, 12345);
      const magnet = buildMagnet(parsed.infoHash, parsed.name, parsed.trackers);
      assert(magnet.startsWith(`magnet:?xt=urn:btih:${expected}`), magnet);
      assert(magnet.includes('tr=udp%3A%2F%2Ftracker.opentrackr.org'), magnet);
    });

    await test('Scrapers: EliteTorrent decodifica enlaces acortame-esto (base64+ROT13)', async () => {
      const factory = require('../src/scrapers/elitetorrent');
      const scraper = factory.create();
      // Muestra real capturada de una ficha (enlaza al .torrent del sitio).
      const sample = 'VjJ0YWEyRXlTbk5oTTJ4WVZrWndUbHBXVW5ObFJteFlUVmhhYTFZd05URlphMUpMV1ZVd2QyTklWbGhXZWtaWVdXdGtUMlJHU25ST1ZURnBZVEJ3ZDFkc1pISk9WMDVYWWtSV1RsZEhVbUZaYkZaaFpGWnJlVTFWWkdsaE0yUTFXVlZrZDJKR1dYZGpSRVphVFZkU1lWcEhjM2hqVmtaWllrVTVhRlpIWjNwV1J6RnlUbGRSZVZKcmJHcFRSbkJvVmpCV2QyUkdVa2RaZWxab1ZtNUNXVlp0TlZkWlYwcHlVMjVDV0dKVVFYaFpiRlkwVmtkR1NFNVdjR2xXYkhCNlYxUkplRkl5U25KTlZsWlhWMFZLVGxsc1pGTmpSbVJ6V2taa2JGWnRlRmxYV0c5M1VGRTlQUT09';
      // decodeProtectedLink es interna; se expone para pruebas vía símbolo de módulo.
      const decoded = scraper.decodeProtectedLink(sample);
      assert.strictEqual(
        decoded,
        'https://www.elitetorrent.com/wp-content/uploads/2026/06/cumbres-borrascosas-(torrent15).torrent'
      );
      // Un magnet directo también pasa sin cambios.
      assert.strictEqual(scraper.decodeProtectedLink('magnet:?xt=urn:btih:abc'), 'magnet:?xt=urn:btih:abc');
    });

    await test('Scrapers: PoW de descargas DonTorrent/MejorTorrent (sha256 ceros)', async () => {
      const { solveDownloadPow, sha256Hex } = require('../src/scrapers/pow');
      const challenge = 'hydra-test-challenge';
      const { nonce, hashHex } = solveDownloadPow(challenge, 3);
      assert(hashHex.startsWith('000'), `hash ${hashHex} debe empezar por 000`);
      assert.strictEqual(hashHex, sha256Hex(`${challenge}${nonce}`));
      // Reproducible
      const again = solveDownloadPow(challenge, 3);
      assert.strictEqual(again.nonce, nonce);
    });

    await test('Scrapers: parser de resultados de DonTorrent (POST /buscar)', async () => {
      const factory = require('../src/scrapers/dontorrent');
      const scraper = factory.create({ id: 'dontorrent', label: 'DonTorrent', baseUrl: 'https://dontorrent.test' });
      const html = `
        <div class="row">
          <a class="text-decoration-none" href="/pelicula/31079/El-Visitante">El Visitante</a>
          <a class="text-decoration-none" href="/serie/125148/125148/Boston-Blue-1-Temporada">Boston Blue 1 Temporada</a>
          <a class="text-decoration-none" href="/juego/9/No-Debe-Aparecer">Juego</a>
          <a class="text-decoration-none" href="/pelicula/31079/El-Visitante">El Visitante (duplicado)</a>
        </div>`;
      const results = scraper.parseSearchHtml(html);
      assert.strictEqual(results.length, 2, 'solo pelicula/serie y sin duplicados');
      assert.strictEqual(results[0].title, 'El Visitante');
      assert.strictEqual(results[0].type, 'movie');
      assert.strictEqual(results[1].type, 'series');
      assert.strictEqual(results[1].detailUrl, 'https://dontorrent.test/serie/125148/125148/Boston-Blue-1-Temporada');
    });

    await test('Scrapers: DonTorrent extrae descargas directas y protegidas de una ficha', async () => {
      const factory = require('../src/scrapers/dontorrent');
      const scraper = factory.create({ baseUrl: 'https://dontorrent.test' });
      const html = `
        <h1>Descargar El Visitante Año 2022 Torrent Gratis</h1>
        <a class="text-white bg-primary rounded-pill d-block shadow-sm text-decoration-none my-1 py-1"
           href="/torrents/El-Visitante-[BluRay-1080p].torrent" download target="_blank">Descargar</a>
        <a class="protected-download" data-content-id="31079" data-tabla="peliculas" href="#">Descargar</a>`;
      const links = scraper.extractDownloadLinks(html, 'https://dontorrent.test/pelicula/31079/El-Visitante');
      assert.ok(links.direct.some(u => u.endsWith('.torrent')), JSON.stringify(links));
      assert.deepStrictEqual(links.protected, [{ contentId: '31079', tabla: 'peliculas' }]);
    });

    await test('Scrapers: parser de la tabla de LimeTorrent', async () => {
      const factory = require('../src/scrapers/limetorrent');
      const scraper = factory.create({ id: 'limetorrent', label: 'LimeTorrent', baseUrl: 'https://limetorrent.test' });
      const html = `
        <table class="table2"><tbody>
        <tr bgcolor="#F5F5F5">
          <td><div class="tt-name"><a href="/moana-2016-1080p-spanish-latino-41006585.html">Moana 2016 1080p Spanish Latino</a></div></td>
          <td>2 months ago - in <a href="/browse-torrents/Movies/">Movies</a></td>
          <td>1.4&nbsp;GB</td>
          <td class="tdseed">120</td>
          <td class="tdleech">30</td>
        </tr>
        <tr bgcolor="#FAFAFA">
          <td><div class="tt-name"><a href="/the-gentlemen-2024-s02e06-1080p-43611426.html">The Gentlemen 2024 S02E06 1080p</a></div></td>
          <td>1 month ago - in <a href="/browse-torrents/TV/">TV shows</a></td>
          <td>916.17&nbsp;MB</td>
          <td class="tdseed">1238</td>
          <td class="tdleech">153</td>
        </tr>
        </tbody></table>`;
      const results = scraper.parseListingHtml(html);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'Moana 2016 1080p Spanish Latino');
      assert.strictEqual(results[0].size, '1.4 GB');
      assert.strictEqual(results[0].seeders, 120);
      // El filtro de español SOLO deja el release hispano.
      const spanish = require('../src/scrapers/base').filterSpanish(results, { assumeSpanish: false });
      assert.strictEqual(spanish.length, 1);
      assert.ok(spanish[0].title.includes('Spanish'));
    });

    await test('Scrapers: ficha de LimeTorrent con hash en claro → magnet', async () => {
      const factory = require('../src/scrapers/limetorrent');
      const scraper = factory.create({ baseUrl: 'https://limetorrent.test' });
      const html = `
        <h1>Moana 2016 1080p Spanish Latino</h1>
        <table><tr><td><b>Torrent Hash</b> :</td><td>85F5CD6E0089E2DC5B1E1260DE4978E3511A3923</td></tr>
        <tr><td><b>Torrent Size</b> :</td><td>1.4 GB</td></tr></table>
        Seeders : 117Leechers : 35`;
      // Mock del cliente HTTP: la lógica de parseo es lo que se prueba.
      const http = require('../src/scrapers/http');
      const originalGetHtml = http.getHtml;
      http.getHtml = async () => html;
      let results;
      try {
        results = await scraper.resolve('https://limetorrent.test/moana-41006585.html');
      } finally {
        http.getHtml = originalGetHtml;
      }
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].infoHash, '85f5cd6e0089e2dc5b1e1260de4978e3511a3923');
      assert.ok(results[0].magnet.startsWith('magnet:?xt=urn:btih:85f5cd6e'), results[0].magnet);
      assert.strictEqual(results[0].seeders, 117);
    });

    await test('Scrapers: SinSitio decodifica ddlUrl.php y extrae la descarga', async () => {
      const factory = require('../src/scrapers/sinsitio');
      const scraper = factory.create({ baseUrl: 'https://sinsitio.test' });
      const target = 'https://sinsitio.test/index.php?do=download&id=70883';
      const encoded = encodeURIComponent(Buffer.from(target).toString('base64'));
      const html = `
        <h1>El complejo BDrip XviD Castellano</h1>
        <a href="/ddlUrl.php?url=${encoded}&name=El%20Complejo%20Castellano">🎬 El Complejo Castellano</a>`;
      const results = scraper.parseSearchHtml(`
        <div class="shortstory">
          <a href="/dvdrip-bdrip/36480-el-complejo-bdrip-xvid-castellano.html">El complejo BDrip XviD Castellano</a>
          <a href="/dvdrip-bdrip/36480-el-complejo-bdrip-xvid-castellano.html#comment">comentario</a>
        </div>`);
      assert.strictEqual(results.length, 1, 'dedupe con #comment');
      assert.strictEqual(results[0].detailUrl, 'https://sinsitio.test/dvdrip-bdrip/36480-el-complejo-bdrip-xvid-castellano.html');
      // La URL ddlUrl decodificada apunta al módulo de descarga de DLE.
      const ddl = html.match(/ddlUrl\.php\?url=([A-Za-z0-9%]+)/);
      const decoded = decodeURIComponent(ddl[1]);
      assert.ok(Buffer.from(decoded, 'base64').toString('utf8').includes('do=download&id=70883'));
    });

    await test('Scrapers: splitQuery separa título de temporada/episodio', async () => {
      const { splitQuery } = require('../src/scrapers/base');
      assert.deepStrictEqual(splitQuery('Moana'), { title: 'Moana', season: null, episode: null });
      const split = splitQuery('Boston Blue S01E02');
      assert.strictEqual(split.title, 'Boston Blue');
      assert.strictEqual(split.season, 1);
      assert.strictEqual(split.episode, 2);
    });

    await test('Scrapers: IDs hydra:scrap-… codifican y decodifican la ficha', async () => {
      const { scrapId, decodeScrapId } = require('../src/scrapers/streams');
      const id = scrapId('dontorrent', 'https://dontorrent.meme/pelicula/31079/El-Visitante');
      assert(id.startsWith('hydra:scrap-dontorrent-'), id);
      const decoded = decodeScrapId(id);
      assert.strictEqual(decoded.site, 'dontorrent');
      assert.strictEqual(decoded.detailUrl, 'https://dontorrent.meme/pelicula/31079/El-Visitante');
      assert.strictEqual(decodeScrapId('hydra:otro'), null);
    });

    await test('Scrapers: filtra por episodio el resultado del buscador', async () => {
      const { filterForRequest } = require('../src/scrapers/streams');
      const results = [
        { title: 'Boston Blue 1x2 HDTV [Castellano]', site: 'dontorrent' },
        { title: 'Boston Blue 1x3 HDTV [Castellano]', site: 'dontorrent' },
        { title: 'Boston Blue 1 Temporada [HDTV]', site: 'mejortorrent' }
      ];
      const forEpisode = filterForRequest(results, { title: 'Boston Blue', season: 1, episode: 2 });
      assert.strictEqual(forEpisode.length, 2, 'episodio 1x2 + pack de temporada');
      const forWholeSeason = filterForRequest(results, { title: 'Boston Blue', season: 1, episode: null });
      assert.strictEqual(forWholeSeason.length, 3);
    });

    await test('API: GET /api/scrapers/search sin "q" devuelve 400', async () => {
      const res = await request('/api/scrapers/search');
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('API: GET /api/scrapers/search responde (aunque las webs fallen)', async () => {
      process.env.SCRAPER_TIMEOUT_MS = '2000';
      const res = await request('/api/scrapers/search?q=moana');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.query, 'moana');
      assert(Array.isArray(res.body.results));
      assert(Array.isArray(res.body.sites));
    });

    await test('API: GET /api/scrapers/status lista los sitios activos', async () => {
      const res = await request('/api/scrapers/status');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.sites) && res.body.sites.length >= 1);
      const ids = res.body.sites.map(s => s.id);
      for (const expected of ['dontorrent', 'mejortorrent', 'pelispanda', 'elitetorrent', 'sinsitio', 'limetorrent']) {
        assert(ids.includes(expected), `falta el sitio ${expected}`);
      }
    });

    await test('API: POST /api/admin/import exige x-admin-secret', async () => {
      const res = await request('/api/admin/import', {
        method: 'POST',
        body: { site: 'dontorrent', detailUrl: 'https://dontorrent.meme/pelicula/31079/El-Visitante' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('API: POST /api/admin/import valida el sitio solicitado', async () => {
      const config = require('../src/config');
      const res = await request('/api/admin/import', {
        method: 'POST',
        headers: { 'x-admin-secret': config.adminSecret },
        body: { site: 'paginamala', detailUrl: 'https://ejemplo.com/ficha' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('Manifiesto: catálogos del buscador de webs torrent', async () => {
      const res = await request('/manifest.json');
      const ids = res.body.catalogs.map(c => c.id);
      for (const expected of ['hydra_torrent_movies', 'hydra_torrent_series', 'hydra_torrent_anime']) {
        assert(ids.includes(expected), `falta el catálogo ${expected}`);
      }
      const movieCatalog = res.body.catalogs.find(c => c.id === 'hydra_torrent_movies');
      assert(movieCatalog.extra.some(e => e.name === 'search'));
    });

    await test('Panel: /admin incluye el buscador de webs torrent', async () => {
      const res = await request('/admin');
      assert(res.raw.includes('Buscador de webs torrent'));
      assert(res.raw.includes('id="scraper-query"'));
      assert(res.raw.includes('value="dontorrent"'));
      assert(res.raw.includes('value="mejortorrent"'));
      assert(res.raw.includes('value="pelispanda"'));
      assert(res.raw.includes('value="elitetorrent"'));
      assert(res.raw.includes('value="sinsitio"'));
      assert(res.raw.includes('value="limetorrent"'));
      const script = await request('/admin.js');
      assert(script.raw.includes('/api/scrapers/search'));
      assert(script.raw.includes('/api/admin/import'));
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
