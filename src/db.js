/**
 * Layerbase PostgreSQL Database Client
 * Cliente oficial 'pg' sobre la tabla hydra_vault, con modo memoria cuando no hay base configurada.
 *
 * Cada función pública se inicializa sola (esquema + índices una vez por instancia), de modo que
 * funciona igual desde Express que desde las funciones serverless de Vercel (api/admin/add.js).
 */

const { Pool } = require('pg');
const config = require('./config');
const { SEED_ENTRIES } = require('./utils/seedData');
const { normalizeEpisodeFields, parseStremioId, filterRowsForEpisode } = require('./utils/episodes');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hydra_vault (
    id SERIAL PRIMARY KEY,

    -- Identificadores multiplataforma
    imdb_id VARCHAR(50),
    tmdb_id VARCHAR(50),
    anilist_id VARCHAR(50),
    kitsu_id VARCHAR(50),
    custom_id VARCHAR(100),

    -- Metadatos y clasificación
    type VARCHAR(20) NOT NULL,             -- 'anime', 'series', 'movie', 'drama'
    season INTEGER CHECK (season IS NULL OR season >= 0),
    episode INTEGER CHECK (episode IS NULL OR episode >= 1),
    episode_title TEXT,
    source_platform VARCHAR(50) DEFAULT 'Torrent',
    title TEXT NOT NULL,
    magnet TEXT NOT NULL,

    -- Detalles técnicos
    quality VARCHAR(20) DEFAULT '1080p',
    audio_lang VARCHAR(50) DEFAULT 'Multi',
    subtitles VARCHAR(50) DEFAULT 'Multi',
    size VARCHAR(20) DEFAULT 'N/D',
    seeders INT DEFAULT 10,

    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS season INTEGER;
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS episode INTEGER;
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS episode_title TEXT;

-- Índices para que las búsquedas de Stremio no recorran toda la tabla.
CREATE INDEX IF NOT EXISTS hydra_vault_imdb_idx ON hydra_vault (imdb_id);
CREATE INDEX IF NOT EXISTS hydra_vault_kitsu_idx ON hydra_vault (kitsu_id);
CREATE INDEX IF NOT EXISTS hydra_vault_tmdb_idx ON hydra_vault (tmdb_id);
CREATE INDEX IF NOT EXISTS hydra_vault_anilist_idx ON hydra_vault (anilist_id);
CREATE INDEX IF NOT EXISTS hydra_vault_custom_idx ON hydra_vault (custom_id);
CREATE INDEX IF NOT EXISTS hydra_vault_created_idx ON hydra_vault (created_at DESC);
CREATE INDEX IF NOT EXISTS hydra_vault_magnet_md5_idx ON hydra_vault (md5(magnet));
`;

const COLUMNS = `id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
  type, season, episode, episode_title, source_platform, title, magnet,
  quality, audio_lang, subtitles, size, seeders, created_at`;

let pool = null;
let readyPromise = null;

// ---------------------------------------------------------------------------
// Memoria (solo cuando LAYERBASE_DATABASE_URL no está configurada)
// ---------------------------------------------------------------------------
const memoryStore = [];
let nextMemoryId = 1;

function initMemoryStore() {
  if (memoryStore.length > 0) return;
  SEED_ENTRIES.forEach((item, index) => {
    memoryStore.push({
      id: nextMemoryId++,
      imdb_id: item.imdb_id || null,
      tmdb_id: item.tmdb_id || null,
      anilist_id: item.anilist_id || null,
      kitsu_id: item.kitsu_id || null,
      custom_id: item.custom_id || null,
      type: item.type,
      season: item.season ?? null,
      episode: item.episode ?? null,
      episode_title: item.episode_title ?? null,
      source_platform: item.source_platform || 'Torrent',
      title: item.title,
      magnet: item.magnet,
      quality: item.quality || '1080p',
      audio_lang: item.audio_lang || 'Multi',
      subtitles: item.subtitles || 'Multi',
      size: item.size || 'N/D',
      seeders: Number.isInteger(item.seeders) ? item.seeders : 10,
      // Fechas escalonadas para que el orden "más reciente" sea estable.
      created_at: new Date(Date.UTC(2026, 0, 1) + index * 60000)
    });
  });
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------
function getPool() {
  if (!pool && config.databaseUrl) {
    const isLocal = config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1');
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      // Una conexión por instancia serverless evita multiplicar sesiones inactivas.
      max: process.env.PG_MAX ? parseInt(process.env.PG_MAX, 10) : 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 6000
    });
    pool.on('error', (err) => {
      console.error('PostgreSQL Pool idle client error:', err.message);
    });
  }
  return pool;
}

async function seedPostgresIfRequested(client) {
  // Los datos demo usan magnets de ejemplo: nunca se insertan en una base real salvo que se pida.
  if (process.env.SEED_DEMO_DATA !== 'true') return;
  const countRes = await client.query('SELECT COUNT(*) FROM hydra_vault');
  if (parseInt(countRes.rows[0].count, 10) > 0) return;
  for (const item of SEED_ENTRIES) {
    await client.query(
      `INSERT INTO hydra_vault (
        imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
        type, season, episode, episode_title, source_platform, title, magnet,
        quality, audio_lang, subtitles, size, seeders
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        item.imdb_id, item.tmdb_id, item.anilist_id, item.kitsu_id, item.custom_id,
        item.type, item.season ?? null, item.episode ?? null, item.episode_title ?? null,
        item.source_platform || 'Torrent', item.title, item.magnet,
        item.quality || '1080p', item.audio_lang || 'Multi', item.subtitles || 'Multi',
        item.size || 'N/D', Number.isInteger(item.seeders) ? item.seeders : 10
      ]
    );
  }
  console.log(`✅ SEED_DEMO_DATA: ${SEED_ENTRIES.length} entradas demo insertadas.`);
}

/**
 * Prepara la base una sola vez por instancia (esquema + índices).
 * Si falla, se reintenta en la siguiente petición.
 */
function ensureReady() {
  if (readyPromise) return readyPromise;
  const p = getPool();
  if (!p) {
    initMemoryStore();
    readyPromise = Promise.resolve({ mode: 'memory' });
    return readyPromise;
  }
  readyPromise = (async () => {
    const client = await p.connect();
    try {
      await client.query(SCHEMA_SQL);
      await seedPostgresIfRequested(client);
      return { mode: 'postgres' };
    } finally {
      client.release();
    }
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });
  return readyPromise;
}

async function initDb() {
  try {
    return await ensureReady();
  } catch (err) {
    console.error('⚠️ No se pudo conectar a Layerbase PostgreSQL:', err.message);
    return { mode: 'error', error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------
function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function sameNullable(a, b) {
  const left = a === undefined || a === null ? null : Number(a);
  const right = b === undefined || b === null ? null : Number(b);
  return left === right;
}

/**
 * Busca un registro idéntico (mismo enlace, mismo episodio y misma versión técnica:
 * calidad, audio y subtítulos) para evitar duplicados por doble clic.
 * El mismo enlace SÍ puede repetirse si cambia el audio, los subtítulos o la calidad
 * (cada uno cuenta como una versión distinta del mismo episodio).
 */
async function findDuplicate({ magnet, season = null, episode = null, quality = null, audio_lang = null, subtitles = null }) {
  const cleanMagnet = cleanText(magnet);
  if (!cleanMagnet) return null;
  const cleanQuality = cleanText(quality);
  const cleanAudio = cleanText(audio_lang);
  const cleanSubs = cleanText(subtitles);
  const p = getPool();
  if (p) {
    await ensureReady();
    const res = await p.query(
      `SELECT ${COLUMNS} FROM hydra_vault
       WHERE md5(magnet) = md5($1) AND magnet = $1
         AND season IS NOT DISTINCT FROM $2::integer
         AND episode IS NOT DISTINCT FROM $3::integer
         AND quality IS NOT DISTINCT FROM $4
         AND audio_lang IS NOT DISTINCT FROM $5
         AND subtitles IS NOT DISTINCT FROM $6
       LIMIT 1`,
      [cleanMagnet, season, episode, cleanQuality, cleanAudio, cleanSubs]
    );
    return res.rows[0] || null;
  }
  initMemoryStore();
  return memoryStore.find(row =>
    row.magnet === cleanMagnet && sameNullable(row.season, season) && sameNullable(row.episode, episode) &&
    (row.quality ?? null) === cleanQuality &&
    (row.audio_lang ?? null) === cleanAudio &&
    (row.subtitles ?? null) === cleanSubs
  ) || null;
}

/**
 * Inserta un registro en hydra_vault.
 * Temporada/episodio se normalizan según el tipo (película, serie/drama o anime).
 */
async function createEntry(entry, { strictEpisodes = false } = {}) {
  const type = entry.type ? String(entry.type).trim().toLowerCase() : 'movie';
  const { season, episode } = normalizeEpisodeFields(type, entry.season, entry.episode, { strict: strictEpisodes });
  const parsedSeeders = parseInt(entry.seeders, 10);

  const clean = {
    imdb_id: cleanText(entry.imdb_id),
    tmdb_id: cleanText(entry.tmdb_id),
    anilist_id: cleanText(entry.anilist_id),
    kitsu_id: cleanText(entry.kitsu_id),
    custom_id: cleanText(entry.custom_id),
    type,
    season,
    episode,
    episode_title: episode !== null ? cleanText(entry.episode_title) : null,
    source_platform: cleanText(entry.source_platform) || 'Torrent',
    title: cleanText(entry.title) || '',
    magnet: cleanText(entry.magnet) || '',
    quality: cleanText(entry.quality) || '1080p',
    audio_lang: cleanText(entry.audio_lang) || 'Multi',
    subtitles: cleanText(entry.subtitles) || 'Multi',
    size: cleanText(entry.size) || 'N/D',
    seeders: Number.isInteger(parsedSeeders) ? parsedSeeders : 10
  };

  if (!clean.title) throw new Error('title is required');
  if (!clean.magnet) throw new Error('magnet is required');

  const p = getPool();
  if (p) {
    await ensureReady();
    const res = await p.query(
      `INSERT INTO hydra_vault (
        imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
        type, season, episode, episode_title, source_platform, title, magnet,
        quality, audio_lang, subtitles, size, seeders
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING ${COLUMNS}`,
      [
        clean.imdb_id, clean.tmdb_id, clean.anilist_id, clean.kitsu_id, clean.custom_id,
        clean.type, clean.season, clean.episode, clean.episode_title, clean.source_platform, clean.title, clean.magnet,
        clean.quality, clean.audio_lang, clean.subtitles, clean.size, clean.seeders
      ]
    );
    return res.rows[0];
  }

  initMemoryStore();
  const newRow = { id: nextMemoryId++, ...clean, created_at: new Date() };
  memoryStore.unshift(newRow);
  return newRow;
}

// ---------------------------------------------------------------------------
// Lectura para Stremio
// ---------------------------------------------------------------------------
function sortByEpisode(rows) {
  return rows.sort((a, b) =>
    (Number(a.season ?? -1) - Number(b.season ?? -1)) ||
    (Number(a.episode ?? -1) - Number(b.episode ?? -1)) ||
    ((b.seeders || 0) - (a.seeders || 0))
  );
}

/**
 * Busca streams para Stremio a partir de su ID.
 * - Sin episodio (película o meta de una serie): todas las filas del título.
 * - Con episodio: solo ese episodio/capítulo exacto y, detrás, los packs completos.
 */
async function findStreamsForStremio({ id }) {
  if (!id) return [];
  const request = parseStremioId(id);
  if (!request.baseId) return [];

  let rows;
  const p = getPool();
  if (p) {
    await ensureReady();
    const res = await p.query(
      `SELECT ${COLUMNS}
       FROM hydra_vault
       WHERE imdb_id = $1 OR imdb_id = $2
          OR tmdb_id = $1 OR tmdb_id = $2
          OR anilist_id = $1 OR anilist_id = $2
          OR kitsu_id = $1 OR kitsu_id = $2
          OR custom_id = $1 OR custom_id = $2
          OR ($3::integer IS NOT NULL AND id = $3::integer)`,
      [request.rawId, request.baseId, request.numericId]
    );
    rows = res.rows;
  } else {
    initMemoryStore();
    const keys = [request.rawId, request.baseId];
    rows = memoryStore.filter(e =>
      keys.includes(e.imdb_id) || keys.includes(e.tmdb_id) || keys.includes(e.kitsu_id) ||
      keys.includes(e.anilist_id) || keys.includes(e.custom_id) ||
      (request.numericId !== null && e.id === request.numericId)
    );
  }

  if (request.episode === null) return sortByEpisode([...rows]);

  const filtered = filterRowsForEpisode(rows, request);
  const isEpisodeRow = row => row.episode !== null && row.episode !== undefined;
  const bySeeders = (a, b) => (b.seeders || 0) - (a.seeders || 0);
  return [
    ...filtered.filter(isEpisodeRow).sort(bySeeders),
    ...filtered.filter(row => !isEpisodeRow(row)).sort(bySeeders)
  ];
}

/**
 * Clave que agrupa todos los episodios/calidades de un mismo título en el catálogo.
 * Debe coincidir con el ID que se publica en Stremio (ver catalogHandler).
 */
function groupKey(row) {
  if (row.imdb_id) return row.imdb_id;
  if (row.kitsu_id) return `kitsu:${row.kitsu_id}`;
  if (row.tmdb_id) return `tmdb:${row.tmdb_id}`;
  if (row.custom_id) return `hydra:${row.custom_id}`;
  return `hydra:${row.id}`;
}

const GROUP_KEY_SQL = `COALESCE(imdb_id, 'kitsu:' || kitsu_id, 'tmdb:' || tmdb_id, 'hydra:' || custom_id, 'hydra:' || id::text)`;

/**
 * Catálogo: un elemento por título (no por episodio), del más reciente al más antiguo.
 */
async function getCatalogItems({ catalogId, type, genre, search, skip = 0, limit = 50 }) {
  const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  const p = getPool();
  if (p) {
    await ensureReady();
    const conditions = [];
    const values = [];

    if (catalogId === 'hydra_dramas') conditions.push(`(type = 'drama' OR source_platform IN ('Viki', 'iQiyi'))`);
    else if (catalogId === 'hydra_anime') conditions.push(`type = 'anime'`);
    else if (catalogId === 'hydra_movies') conditions.push(`type = 'movie'`);
    else if (catalogId === 'hydra_series') conditions.push(`type IN ('series', 'drama')`);
    else if (type) {
      values.push(type);
      conditions.push(`type = $${values.length}`);
    }

    if (genre && genre !== 'All') {
      values.push(`%${genre}%`);
      const idx = values.length;
      conditions.push(`(source_platform ILIKE $${idx} OR audio_lang ILIKE $${idx} OR quality ILIKE $${idx})`);
    }

    if (search && search.trim()) {
      values.push(`%${search.trim()}%`);
      const idx = values.length;
      conditions.push(`(title ILIKE $${idx} OR custom_id ILIKE $${idx})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parsedLimit);
    const limitIdx = values.length;
    values.push(parsedSkip);
    const skipIdx = values.length;

    const res = await p.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (${GROUP_KEY_SQL}) ${COLUMNS}, ${GROUP_KEY_SQL} AS group_key
         FROM hydra_vault
         ${whereClause}
         ORDER BY ${GROUP_KEY_SQL}, created_at DESC
       ) grouped
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${skipIdx}`,
      values
    );
    return res.rows;
  }

  initMemoryStore();
  let results = [...memoryStore];

  if (catalogId === 'hydra_dramas') results = results.filter(e => e.type === 'drama' || ['Viki', 'iQiyi'].includes(e.source_platform));
  else if (catalogId === 'hydra_anime') results = results.filter(e => e.type === 'anime');
  else if (catalogId === 'hydra_movies') results = results.filter(e => e.type === 'movie');
  else if (catalogId === 'hydra_series') results = results.filter(e => ['series', 'drama'].includes(e.type));
  else if (type) results = results.filter(e => e.type === type);

  if (genre && genre !== 'All') {
    const g = genre.toLowerCase();
    results = results.filter(e =>
      (e.source_platform && e.source_platform.toLowerCase().includes(g)) ||
      (e.audio_lang && e.audio_lang.toLowerCase().includes(g)) ||
      (e.quality && e.quality.toLowerCase().includes(g))
    );
  }

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    results = results.filter(e =>
      (e.title && e.title.toLowerCase().includes(s)) ||
      (e.custom_id && e.custom_id.toLowerCase().includes(s))
    );
  }

  results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const seen = new Set();
  const grouped = [];
  for (const row of results) {
    const key = groupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    grouped.push({ ...row, group_key: key });
  }
  return grouped.slice(parsedSkip, parsedSkip + parsedLimit);
}

// ---------------------------------------------------------------------------
// Gestión de datos desde /admin (listar, buscar y eliminar)
// ---------------------------------------------------------------------------

/**
 * Lista registros con búsqueda libre y filtro por tipo, ordenados del más reciente al más antiguo.
 * Devuelve { rows, total } para paginar en el panel.
 */
async function listEntries({ search = '', type = '', skip = 0, limit = 20 } = {}) {
  const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const cleanSearch = cleanText(search);
  const cleanType = cleanText(type);

  const p = getPool();
  if (p) {
    await ensureReady();
    const conditions = [];
    const values = [];

    if (cleanType) {
      values.push(cleanType.toLowerCase());
      conditions.push(`type = $${values.length}`);
    }
    if (cleanSearch) {
      values.push(`%${cleanSearch}%`);
      const idx = values.length;
      conditions.push(
        `(title ILIKE $${idx} OR magnet ILIKE $${idx}
         OR COALESCE(custom_id, '') ILIKE $${idx} OR COALESCE(imdb_id, '') ILIKE $${idx}
         OR COALESCE(kitsu_id, '') ILIKE $${idx} OR COALESCE(tmdb_id, '') ILIKE $${idx}
         OR COALESCE(anilist_id, '') ILIKE $${idx} OR COALESCE(episode_title, '') ILIKE $${idx})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await p.query(`SELECT COUNT(*)::int AS total FROM hydra_vault ${whereClause}`, values);
    const total = countRes.rows[0].total;

    const listValues = [...values, parsedLimit, parsedSkip];
    const res = await p.query(
      `SELECT ${COLUMNS} FROM hydra_vault
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    );
    return { rows: res.rows, total };
  }

  initMemoryStore();
  let results = [...memoryStore];
  if (cleanType) {
    const wanted = cleanType.toLowerCase();
    results = results.filter(e => e.type === wanted);
  }
  if (cleanSearch) {
    const s = cleanSearch.toLowerCase();
    results = results.filter(e =>
      [e.title, e.magnet, e.custom_id, e.imdb_id, e.kitsu_id, e.tmdb_id, e.anilist_id, e.episode_title]
        .some(v => v && String(v).toLowerCase().includes(s))
    );
  }
  results.sort((a, b) =>
    (new Date(b.created_at) - new Date(a.created_at)) || (b.id - a.id)
  );
  return {
    rows: results.slice(parsedSkip, parsedSkip + parsedLimit).map(row => ({ ...row })),
    total: results.length
  };
}

/**
 * Elimina registros por id. Devuelve { deleted, ids } con los ids realmente borrados.
 */
async function deleteEntries(ids) {
  const wanted = [...new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map(value => (typeof value === 'number' ? value : parseInt(String(value).trim(), 10)))
      .filter(value => Number.isInteger(value) && value > 0)
  )];
  if (wanted.length === 0) return { deleted: 0, ids: [] };

  const p = getPool();
  if (p) {
    await ensureReady();
    const res = await p.query(
      `DELETE FROM hydra_vault WHERE id = ANY($1::int[]) RETURNING id`,
      [wanted]
    );
    return { deleted: res.rowCount, ids: res.rows.map(row => row.id) };
  }

  initMemoryStore();
  const toDelete = new Set(wanted);
  const remaining = [];
  const deleted = [];
  for (const row of memoryStore) {
    if (toDelete.has(row.id)) deleted.push(row.id);
    else remaining.push(row);
  }
  memoryStore.length = 0;
  memoryStore.push(...remaining);
  return { deleted: deleted.length, ids: deleted };
}

module.exports = {
  initDb,
  ensureReady,
  createEntry,
  findDuplicate,
  findStreamsForStremio,
  getCatalogItems,
  listEntries,
  deleteEntries,
  groupKey
};
