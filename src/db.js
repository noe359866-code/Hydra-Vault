/**
 * Layerbase PostgreSQL Database Client
 * Official 'pg' client implementation adhering strictly to the hydra_vault schema.
 */

const { Pool } = require('pg');
const config = require('./config');
const { SEED_ENTRIES } = require('./utils/seedData');
const { normalizeEpisodeFields, parseStremioId, filterRowsForEpisode } = require('./utils/episodes');

let pool = null;
let isPgAvailable = false;
let lastError = null;

// Exact SQL Table Definition from Specification
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
    type VARCHAR(20) NOT NULL,             -- Valores: 'anime', 'series', 'movie', 'drama'
    season INTEGER CHECK (season IS NULL OR season >= 0),
    episode INTEGER CHECK (episode IS NULL OR episode >= 1),
    episode_title TEXT,
    source_platform VARCHAR(50) DEFAULT 'Torrent', -- Valores: 'Torrent', 'Viki', 'iQiyi', 'Direct', etc.
    title TEXT NOT NULL,                   -- Título descriptivo para Stremio
    magnet TEXT NOT NULL,                  -- Enlace Magnet o URL
    
    -- Detalles técnicos
    quality VARCHAR(20) DEFAULT '1080p',   -- Ej: '1080p', '4K', '720p'
    audio_lang VARCHAR(50) DEFAULT 'Multi',-- Ej: 'Latino', 'Sub Español', 'Jap/Sub'
    subtitles VARCHAR(50) DEFAULT 'Multi', -- Ej: 'Español', 'Inglés', 'Multi'
    size VARCHAR(20) DEFAULT 'N/D',        -- Ej: '1.4 GB', '450 MB'
    seeders INT DEFAULT 10,
    
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS season INTEGER;
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS episode INTEGER;
ALTER TABLE hydra_vault ADD COLUMN IF NOT EXISTS episode_title TEXT;
`;

// In-Memory Fallback Store (used when LAYERBASE_DATABASE_URL is not configured)
let memoryStore = [];
let nextMemoryId = 1;

function initMemoryStore() {
  if (memoryStore.length === 0) {
    SEED_ENTRIES.forEach((item) => {
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
        created_at: new Date()
      });
    });
  }
}

/**
 * Initializes the PostgreSQL Pool
 */
function getPool() {
  if (!pool && config.databaseUrl) {
    try {
      const isLocal = config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1');
      pool = new Pool({
        connectionString: config.databaseUrl,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        // One connection per serverless instance avoids multiplying idle DB sessions.
        max: process.env.PG_MAX ? parseInt(process.env.PG_MAX, 10) : 1,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 6000
      });

      pool.on('error', (err) => {
        console.error('PostgreSQL Pool idle client error:', err.message);
        lastError = err.message;
        isPgAvailable = false;
      });
    } catch (err) {
      console.error('Error constructing PostgreSQL Pool:', err.message);
      lastError = err.message;
      pool = null;
    }
  }
  return pool;
}

/**
 * Test connection and initialize table if needed
 */
async function initDb() {
  const p = getPool();
  if (!p) {
    console.log('ℹ️ LAYERBASE_DATABASE_URL not set. Running with In-Memory Mock Store.');
    initMemoryStore();
    return { mode: 'memory', count: memoryStore.length };
  }

  try {
    const client = await p.connect();
    try {
      await client.query(SCHEMA_SQL);
      isPgAvailable = true;
      lastError = null;
      console.log('✅ Connected to Layerbase PostgreSQL. Schema verified.');

      // Check if table is empty; if so, populate with initial curated seed data
      const countRes = await client.query('SELECT COUNT(*) FROM hydra_vault');
      const count = parseInt(countRes.rows[0].count, 10);
      if (count === 0) {
        console.log('ℹ️ hydra_vault is empty. Populating with initial curated seed entries...');
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
        console.log(`✅ Seeded ${SEED_ENTRIES.length} curated entries into Layerbase PostgreSQL.`);
      }

      return { mode: 'postgres', count: count || SEED_ENTRIES.length };
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('⚠️ Could not connect to Layerbase PostgreSQL:', err.message);
    lastError = err.message;
    isPgAvailable = false;
    initMemoryStore();
    return { mode: 'memory_fallback', error: err.message, count: memoryStore.length };
  }
}


const COLUMNS = `id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
  type, season, episode, episode_title, source_platform, title, magnet,
  quality, audio_lang, subtitles, size, seeders, created_at`;

/**
 * Inserta un registro en hydra_vault.
 * Temporada/episodio se normalizan según el tipo (película, serie/drama o anime).
 */
async function createEntry(entry, { strictEpisodes = false } = {}) {
  const type = entry.type ? String(entry.type).trim().toLowerCase() : 'movie';
  const { season, episode } = normalizeEpisodeFields(type, entry.season, entry.episode, { strict: strictEpisodes });

  const clean = {
    imdb_id: entry.imdb_id ? String(entry.imdb_id).trim() : null,
    tmdb_id: entry.tmdb_id ? String(entry.tmdb_id).trim() : null,
    anilist_id: entry.anilist_id ? String(entry.anilist_id).trim() : null,
    kitsu_id: entry.kitsu_id ? String(entry.kitsu_id).trim() : null,
    custom_id: entry.custom_id ? String(entry.custom_id).trim() : null,
    type,
    season,
    episode,
    episode_title: episode !== null && entry.episode_title ? String(entry.episode_title).trim() : null,
    source_platform: entry.source_platform ? String(entry.source_platform).trim() : 'Torrent',
    title: String(entry.title || '').trim(),
    magnet: String(entry.magnet || '').trim(),
    quality: entry.quality ? String(entry.quality).trim() : '1080p',
    audio_lang: entry.audio_lang ? String(entry.audio_lang).trim() : 'Multi',
    subtitles: entry.subtitles ? String(entry.subtitles).trim() : 'Multi',
    size: entry.size ? String(entry.size).trim() : 'N/D',
    seeders: Number.isInteger(parseInt(entry.seeders, 10)) ? parseInt(entry.seeders, 10) : 10
  };

  if (!clean.title) throw new Error('title is required');
  if (!clean.magnet) throw new Error('magnet is required');

  const p = getPool();
  if (p && isPgAvailable) {
    const sql = `
      INSERT INTO hydra_vault (
        imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
        type, season, episode, episode_title, source_platform, title, magnet,
        quality, audio_lang, subtitles, size, seeders
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      RETURNING ${COLUMNS}
    `;
    const values = [
      clean.imdb_id, clean.tmdb_id, clean.anilist_id, clean.kitsu_id, clean.custom_id,
      clean.type, clean.season, clean.episode, clean.episode_title, clean.source_platform, clean.title, clean.magnet,
      clean.quality, clean.audio_lang, clean.subtitles, clean.size, clean.seeders
    ];
    try {
      const res = await p.query(sql, values);
      return res.rows[0];
    } catch (err) {
      console.error('Error creating entry in PostgreSQL:', err.message);
      throw err;
    }
  }

  if (p) throw new Error('PostgreSQL is configured but unavailable; refusing to report an in-memory write as persisted.');

  // Memory Fallback (only when no database URL is configured)
  initMemoryStore();
  const newRow = {
    id: nextMemoryId++,
    ...clean,
    created_at: new Date()
  };
  memoryStore.unshift(newRow);
  return newRow;
}

function sortRows(rows) {
  return rows.sort((a, b) =>
    (Number(a.season ?? -1) - Number(b.season ?? -1)) ||
    (Number(a.episode ?? -1) - Number(b.episode ?? -1)) ||
    ((b.seeders || 0) - (a.seeders || 0))
  );
}

/**
 * Busca streams para Stremio a partir de su ID.
 * - Sin episodio (película o meta de una serie): devuelve todas las filas del título.
 * - Con episodio: devuelve solo ese episodio/capítulo exacto y, detrás, los packs completos.
 *   Nunca mezcla episodios distintos.
 */
async function findStreamsForStremio({ id }) {
  if (!id) return [];

  const request = parseStremioId(id);
  if (!request.baseId) return [];

  let rows = null;
  const p = getPool();
  if (p && isPgAvailable) {
    try {
      const sql = `
        SELECT ${COLUMNS}
        FROM hydra_vault
        WHERE imdb_id = $1 OR imdb_id = $2
           OR tmdb_id = $1 OR tmdb_id = $2
           OR anilist_id = $1 OR anilist_id = $2
           OR kitsu_id = $1 OR kitsu_id = $2
           OR custom_id = $1 OR custom_id = $2
           OR ($3::integer IS NOT NULL AND id = $3::integer)
      `;
      const res = await p.query(sql, [request.rawId, request.baseId, request.numericId]);
      rows = res.rows;
    } catch (err) {
      console.error('Error querying streams from PostgreSQL:', err.message);
    }
  }

  if (rows === null) {
    initMemoryStore();
    const keys = [request.rawId, request.baseId];
    rows = memoryStore.filter(e =>
      keys.includes(e.imdb_id) || keys.includes(e.tmdb_id) || keys.includes(e.kitsu_id) ||
      keys.includes(e.anilist_id) || keys.includes(e.custom_id) ||
      (request.numericId !== null && e.id === request.numericId)
    );
  }

  if (request.episode === null) return sortRows([...rows]);

  // Episodios exactos ordenados por seeders, y luego packs ordenados por seeders.
  const filtered = filterRowsForEpisode(rows, request);
  const exact = filtered.filter(row => row.episode !== null && row.episode !== undefined);
  const packs = filtered.filter(row => row.episode === null || row.episode === undefined);
  const bySeeders = (a, b) => (b.seeders || 0) - (a.seeders || 0);
  return [...exact.sort(bySeeders), ...packs.sort(bySeeders)];
}

/**
 * Get Catalog Items for Stremio Catalog endpoint
 */
async function getCatalogItems({ catalogId, type, genre, search, skip = 0, limit = 50 }) {
  const p = getPool();
  const parsedSkip = parseInt(skip, 10) || 0;
  const parsedLimit = parseInt(limit, 10) || 50;

  if (p && isPgAvailable) {
    try {
      const conditions = [];
      const values = [];

      // Filter by type or catalog intent
      if (catalogId === 'hydra_dramas') {
        conditions.push(`(type = 'drama' OR source_platform IN ('Viki', 'iQiyi'))`);
      } else if (catalogId === 'hydra_anime') {
        conditions.push(`type = 'anime'`);
      } else if (catalogId === 'hydra_movies') {
        conditions.push(`type = 'movie'`);
      } else if (catalogId === 'hydra_series') {
        conditions.push(`type IN ('series', 'drama')`);
      } else if (type) {
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      values.push(parsedLimit);
      const limitIdx = values.length;
      values.push(parsedSkip);
      const skipIdx = values.length;

      const sql = `
        SELECT DISTINCT ON (COALESCE(imdb_id, kitsu_id, tmdb_id, custom_id, id::text))
               id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
               type, source_platform, title, quality, audio_lang, subtitles, size, seeders
        FROM hydra_vault
        ${whereClause}
        ORDER BY COALESCE(imdb_id, kitsu_id, tmdb_id, custom_id, id::text), seeders DESC
        LIMIT $${limitIdx} OFFSET $${skipIdx}
      `;
      const res = await p.query(sql, values);
      return res.rows;
    } catch (err) {
      console.error('Error fetching catalog items from PostgreSQL:', err.message);
    }
  }

  // Memory Fallback
  initMemoryStore();
  let results = [...memoryStore];

  if (catalogId === 'hydra_dramas') {
    results = results.filter(e => e.type === 'drama' || ['Viki', 'iQiyi'].includes(e.source_platform));
  } else if (catalogId === 'hydra_anime') {
    results = results.filter(e => e.type === 'anime');
  } else if (catalogId === 'hydra_movies') {
    results = results.filter(e => e.type === 'movie');
  } else if (catalogId === 'hydra_series') {
    results = results.filter(e => ['series', 'drama'].includes(e.type));
  } else if (type) {
    results = results.filter(e => e.type === type);
  }

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

  return results.slice(parsedSkip, parsedSkip + parsedLimit);
}


module.exports = {
  initDb,
  createEntry,
  findStreamsForStremio,
  getCatalogItems
};
