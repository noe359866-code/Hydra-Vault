/**
 * Layerbase PostgreSQL Database Client
 * Official 'pg' client implementation adhering strictly to the hydra_vault schema.
 */

const { Pool } = require('pg');
const config = require('./config');
const { SEED_ENTRIES } = require('./utils/seedData');

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
              type, source_platform, title, magnet,
              quality, audio_lang, subtitles, size, seeders
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              item.imdb_id, item.tmdb_id, item.anilist_id, item.kitsu_id, item.custom_id,
              item.type, item.source_platform, item.title, item.magnet,
              item.quality, item.audio_lang, item.subtitles || 'Multi', item.size, item.seeders
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

/**
 * Health check & connection status
 */
async function checkHealth() {
  const p = getPool();
  if (!p) {
    return {
      status: 'ok',
      mode: 'memory',
      connected: false,
      message: 'Running in In-Memory mode. Set LAYERBASE_DATABASE_URL to use Layerbase PostgreSQL.',
      poolAvailable: false
    };
  }

  const start = Date.now();
  try {
    const res = await p.query('SELECT NOW() AS now, count(*) AS total FROM hydra_vault');
    isPgAvailable = true;
    lastError = null;
    return {
      status: 'ok',
      mode: 'postgres',
      connected: true,
      latencyMs: Date.now() - start,
      databaseTime: res.rows[0].now,
      totalEntries: parseInt(res.rows[0].total, 10)
    };
  } catch (err) {
    isPgAvailable = false;
    lastError = err.message;
    return {
      status: 'degraded',
      mode: 'postgres',
      connected: false,
      error: err.message,
      message: 'Failed to query Layerbase PostgreSQL. Falling back to memory mode for queries.'
    };
  }
}

/**
 * Get Paginated & Filtered Entries for the Admin Panel
 */
async function getEntries({ type, platform, search, page = 1, limit = 50, sort = 'newest' } = {}) {
  const p = getPool();
  const offset = (page - 1) * limit;

  if (p && isPgAvailable) {
    try {
      const conditions = [];
      const values = [];

      if (type && type !== 'all') {
        values.push(type);
        conditions.push(`type = $${values.length}`);
      }

      if (platform && platform !== 'all') {
        values.push(platform);
        conditions.push(`source_platform ILIKE $${values.length}`);
      }

      if (search && search.trim()) {
        values.push(`%${search.trim()}%`);
        const idx = values.length;
        conditions.push(`(
          title ILIKE $${idx} 
          OR imdb_id ILIKE $${idx} 
          OR tmdb_id ILIKE $${idx} 
          OR kitsu_id ILIKE $${idx} 
          OR anilist_id ILIKE $${idx} 
          OR custom_id ILIKE $${idx}
        )`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      let orderBy = 'ORDER BY created_at DESC';
      if (sort === 'oldest') orderBy = 'ORDER BY created_at ASC';
      if (sort === 'seeders') orderBy = 'ORDER BY seeders DESC, created_at DESC';
      if (sort === 'title') orderBy = 'ORDER BY title ASC';

      // Count query
      const countSql = `SELECT COUNT(*) FROM hydra_vault ${whereClause}`;
      const countRes = await p.query(countSql, values);
      const total = parseInt(countRes.rows[0].count, 10);

      // Data query
      values.push(limit);
      const limitIdx = values.length;
      values.push(offset);
      const offsetIdx = values.length;

      const dataSql = `
        SELECT id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
               type, season, episode, episode_title, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders, created_at
        FROM hydra_vault
        ${whereClause}
        ${orderBy}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const dataRes = await p.query(dataSql, values);
      return {
        entries: dataRes.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (err) {
      console.error('Error fetching entries from PostgreSQL:', err.message);
      // Fallback to memory on failure
    }
  }

  // Memory Fallback
  initMemoryStore();
  let results = [...memoryStore];

  if (type && type !== 'all') {
    results = results.filter(e => e.type.toLowerCase() === type.toLowerCase());
  }

  if (platform && platform !== 'all') {
    results = results.filter(e => e.source_platform.toLowerCase() === platform.toLowerCase());
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    results = results.filter(e => 
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.imdb_id && e.imdb_id.toLowerCase().includes(q)) ||
      (e.tmdb_id && e.tmdb_id.toLowerCase().includes(q)) ||
      (e.kitsu_id && e.kitsu_id.toLowerCase().includes(q)) ||
      (e.anilist_id && e.anilist_id.toLowerCase().includes(q)) ||
      (e.custom_id && e.custom_id.toLowerCase().includes(q))
    );
  }

  if (sort === 'oldest') {
    results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sort === 'seeders') {
    results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  } else if (sort === 'title') {
    results.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const total = results.length;
  const paginated = results.slice(offset, offset + limit);

  return {
    entries: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Get Entry by ID
 */
async function getEntryById(id) {
  const p = getPool();
  const numId = parseInt(id, 10);

  if (p && isPgAvailable && !isNaN(numId)) {
    try {
      const res = await p.query(
        `SELECT id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
                type, season, episode, episode_title, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders, created_at
         FROM hydra_vault
         WHERE id = $1`,
        [numId]
      );
      if (res.rows.length > 0) return res.rows[0];
    } catch (err) {
      console.error('Error fetching entry by ID from PostgreSQL:', err.message);
    }
  }

  initMemoryStore();
  return memoryStore.find(e => e.id === numId) || null;
}

/**
 * Insert a New Entry into hydra_vault
 * Exact schema adherence:
 * imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id, type, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders
 */
async function createEntry(entry) {
  const clean = {
    imdb_id: entry.imdb_id ? String(entry.imdb_id).trim() : null,
    tmdb_id: entry.tmdb_id ? String(entry.tmdb_id).trim() : null,
    anilist_id: entry.anilist_id ? String(entry.anilist_id).trim() : null,
    kitsu_id: entry.kitsu_id ? String(entry.kitsu_id).trim() : null,
    custom_id: entry.custom_id ? String(entry.custom_id).trim() : null,
    type: entry.type ? String(entry.type).trim().toLowerCase() : 'movie',
    season: entry.season === '' || entry.season === undefined || entry.season === null ? null : Number(entry.season),
    episode: entry.episode === '' || entry.episode === undefined || entry.episode === null ? null : Number(entry.episode),
    episode_title: entry.episode_title ? String(entry.episode_title).trim() : null,
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
  if (!clean.type) throw new Error('type is required');
  if (clean.season !== null && (!Number.isInteger(clean.season) || clean.season < 0)) throw new Error('season must be a non-negative integer');
  if (clean.episode !== null && (!Number.isInteger(clean.episode) || clean.episode < 1)) throw new Error('episode must be a positive integer');
  if ((clean.season === null) !== (clean.episode === null) && ['series','drama','anime'].includes(clean.type)) throw new Error('season and episode must be supplied together for episodic content');

  const p = getPool();
  if (p && isPgAvailable) {
    try {
      const sql = `
        INSERT INTO hydra_vault (
          imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
          type, season, episode, episode_title, source_platform, title, magnet,
          quality, audio_lang, subtitles, size, seeders
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        RETURNING id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
                  type, season, episode, episode_title, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders, created_at
      `;
      const values = [
        clean.imdb_id, clean.tmdb_id, clean.anilist_id, clean.kitsu_id, clean.custom_id,
        clean.type, clean.season, clean.episode, clean.episode_title, clean.source_platform, clean.title, clean.magnet,
        clean.quality, clean.audio_lang, clean.subtitles, clean.size, clean.seeders
      ];
      const res = await p.query(sql, values);
      return res.rows[0];
    } catch (err) {
      console.error('Error creating entry in PostgreSQL:', err.message);
      throw err;
    }
  }

  // Memory Fallback
  initMemoryStore();
  const newRow = {
    id: nextMemoryId++,
    ...clean,
    created_at: new Date()
  };
  memoryStore.unshift(newRow);
  return newRow;
}

/**
 * Update an Existing Entry in hydra_vault
 */
async function updateEntry(id, entry) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) throw new Error('Invalid ID');

  const clean = {
    imdb_id: entry.imdb_id !== undefined ? (entry.imdb_id ? String(entry.imdb_id).trim() : null) : undefined,
    tmdb_id: entry.tmdb_id !== undefined ? (entry.tmdb_id ? String(entry.tmdb_id).trim() : null) : undefined,
    anilist_id: entry.anilist_id !== undefined ? (entry.anilist_id ? String(entry.anilist_id).trim() : null) : undefined,
    kitsu_id: entry.kitsu_id !== undefined ? (entry.kitsu_id ? String(entry.kitsu_id).trim() : null) : undefined,
    custom_id: entry.custom_id !== undefined ? (entry.custom_id ? String(entry.custom_id).trim() : null) : undefined,
    type: entry.type ? String(entry.type).trim().toLowerCase() : undefined,
    season: entry.season !== undefined ? (entry.season === null || entry.season === '' ? null : Number(entry.season)) : undefined,
    episode: entry.episode !== undefined ? (entry.episode === null || entry.episode === '' ? null : Number(entry.episode)) : undefined,
    episode_title: entry.episode_title !== undefined ? (entry.episode_title ? String(entry.episode_title).trim() : null) : undefined,
    source_platform: entry.source_platform ? String(entry.source_platform).trim() : undefined,
    title: entry.title ? String(entry.title).trim() : undefined,
    magnet: entry.magnet ? String(entry.magnet).trim() : undefined,
    quality: entry.quality ? String(entry.quality).trim() : undefined,
    audio_lang: entry.audio_lang ? String(entry.audio_lang).trim() : undefined,
    subtitles: entry.subtitles !== undefined ? (entry.subtitles ? String(entry.subtitles).trim() : null) : undefined,
    size: entry.size ? String(entry.size).trim() : undefined,
    seeders: entry.seeders !== undefined ? parseInt(entry.seeders, 10) : undefined
  };

  const p = getPool();
  if (p && isPgAvailable) {
    try {
      // First get existing row to retain unchanged fields
      const existingRes = await p.query('SELECT * FROM hydra_vault WHERE id = $1', [numId]);
      if (existingRes.rows.length === 0) return null;
      const current = existingRes.rows[0];

      const merged = {
        imdb_id: clean.imdb_id !== undefined ? clean.imdb_id : current.imdb_id,
        tmdb_id: clean.tmdb_id !== undefined ? clean.tmdb_id : current.tmdb_id,
        anilist_id: clean.anilist_id !== undefined ? clean.anilist_id : current.anilist_id,
        kitsu_id: clean.kitsu_id !== undefined ? clean.kitsu_id : current.kitsu_id,
        custom_id: clean.custom_id !== undefined ? clean.custom_id : current.custom_id,
        type: clean.type !== undefined ? clean.type : current.type,
        season: clean.season !== undefined ? clean.season : current.season,
        episode: clean.episode !== undefined ? clean.episode : current.episode,
        episode_title: clean.episode_title !== undefined ? clean.episode_title : current.episode_title,
        source_platform: clean.source_platform !== undefined ? clean.source_platform : current.source_platform,
        title: clean.title !== undefined ? clean.title : current.title,
        magnet: clean.magnet !== undefined ? clean.magnet : current.magnet,
        quality: clean.quality !== undefined ? clean.quality : current.quality,
        audio_lang: clean.audio_lang !== undefined ? clean.audio_lang : current.audio_lang,
        subtitles: clean.subtitles !== undefined ? clean.subtitles : current.subtitles,
        size: clean.size !== undefined ? clean.size : current.size,
        seeders: clean.seeders !== undefined ? clean.seeders : current.seeders
      };

      const sql = `
        UPDATE hydra_vault SET
          imdb_id = $1, tmdb_id = $2, anilist_id = $3, kitsu_id = $4, custom_id = $5,
          type = $6, season = $7, episode = $8, episode_title = $9,
          source_platform = $10, title = $11, magnet = $12,
          quality = $13, audio_lang = $14, subtitles = $15, size = $16, seeders = $17
        WHERE id = $18
        RETURNING id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
                  type, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders, created_at
      `;
      const values = [
        merged.imdb_id, merged.tmdb_id, merged.anilist_id, merged.kitsu_id, merged.custom_id,
        merged.type, merged.season, merged.episode, merged.episode_title,
        merged.source_platform, merged.title, merged.magnet,
        merged.quality, merged.audio_lang, merged.subtitles, merged.size, merged.seeders,
        numId
      ];

      const res = await p.query(sql, values);
      return res.rows[0];
    } catch (err) {
      console.error('Error updating entry in PostgreSQL:', err.message);
      throw err;
    }
  }

  // Memory Fallback
  initMemoryStore();
  const idx = memoryStore.findIndex(e => e.id === numId);
  if (idx === -1) return null;
  
  memoryStore[idx] = {
    ...memoryStore[idx],
    ...Object.fromEntries(Object.entries(clean).filter(([_, v]) => v !== undefined))
  };
  return memoryStore[idx];
}

/**
 * Delete an Entry by ID
 */
async function deleteEntry(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) throw new Error('Invalid ID');

  const p = getPool();
  if (p && isPgAvailable) {
    try {
      const res = await p.query('DELETE FROM hydra_vault WHERE id = $1 RETURNING id', [numId]);
      return res.rows.length > 0;
    } catch (err) {
      console.error('Error deleting entry in PostgreSQL:', err.message);
      throw err;
    }
  }

  initMemoryStore();
  const idx = memoryStore.findIndex(e => e.id === numId);
  if (idx !== -1) {
    memoryStore.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Find Streams for Stremio by ID
 * Evaluates:
 * - Full ID (e.g. tt1234567, tt1234567:1:1, kitsu:41370:1, tmdb:12345:1:1, hydra:1)
 * - Base ID (e.g. tt1234567, 41370, 12345, 1)
 * - Season & Episode if available
 */
async function findStreamsForStremio({ type, id }) {
  if (!id) return [];

  const rawId = String(id).trim();
  const parts = rawId.split(':');
  
  let baseId = rawId;
  let season = null;
  let episode = null;
  let numericId = null;

  // Handle format like tt1234567:1:2
  if (rawId.startsWith('tt') && parts.length >= 3) {
    baseId = parts[0];
    season = parseInt(parts[1], 10);
    episode = parseInt(parts[2], 10);
  } else if (rawId.startsWith('kitsu:') && parts.length >= 3) {
    // kitsu:41370:1 -> base: 41370, episode: 1
    baseId = parts[1];
    episode = parseInt(parts[2], 10);
  } else if (rawId.startsWith('kitsu:') && parts.length === 2) {
    baseId = parts[1];
  } else if (rawId.startsWith('anilist:') && parts.length >= 3) {
    baseId = parts[1];
    episode = parseInt(parts[2], 10);
  } else if (rawId.startsWith('anilist:') && parts.length === 2) {
    baseId = parts[1];
  } else if (rawId.startsWith('tmdb:') && parts.length >= 4) {
    baseId = parts[1];
    season = parseInt(parts[2], 10);
    episode = parseInt(parts[3], 10);
  } else if (rawId.startsWith('tmdb:') && parts.length === 2) {
    baseId = parts[1];
  } else if (rawId.startsWith('hydra:')) {
    const tail = parts.slice(1).join(':');
    const parsed = parseInt(tail, 10);
    if (!isNaN(parsed)) numericId = parsed;
    baseId = tail;
  } else if (/^\d+$/.test(rawId)) {
    numericId = parseInt(rawId, 10);
  }

  const p = getPool();
  if (p && isPgAvailable) {
    try {
      const sql = `
        SELECT id, imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
               type, source_platform, title, magnet, quality, audio_lang, subtitles, size, seeders, created_at
        FROM hydra_vault
        WHERE 
          imdb_id = $1 OR imdb_id = $2
          OR tmdb_id = $1 OR tmdb_id = $2
          OR anilist_id = $1 OR anilist_id = $2
          OR kitsu_id = $1 OR kitsu_id = $2
          OR custom_id = $1 OR custom_id = $2
          OR (custom_id IS NOT NULL AND ($1 ILIKE ('%' || custom_id || '%') OR custom_id ILIKE ('%' || $1 || '%')))
          OR ($3::integer IS NOT NULL AND id = $3::integer)
        ORDER BY seeders DESC, created_at DESC
      `;
      const values = [rawId, baseId, numericId];
      const res = await p.query(sql, values);
      let rows = res.rows;

      // If season & episode specified, filter or score results matching episode
      if (season !== null && episode !== null && rows.length > 0) {
        const exact = rows.filter(row => Number(row.season) === season && Number(row.episode) === episode);
        rows = exact.length ? exact : filterAndSortByEpisode(rows, season, episode);
      } else if (episode !== null && rows.length > 0) {
        rows = filterAndSortByEpisode(rows, 1, episode);
      }

      return rows;
    } catch (err) {
      console.error('Error querying streams from PostgreSQL:', err.message);
    }
  }

  // Memory Fallback
  initMemoryStore();
  let matches = memoryStore.filter(e => {
    if (e.imdb_id === rawId || e.imdb_id === baseId) return true;
    if (e.tmdb_id === rawId || e.tmdb_id === baseId) return true;
    if (e.kitsu_id === rawId || e.kitsu_id === baseId) return true;
    if (e.anilist_id === rawId || e.anilist_id === baseId) return true;
    if (e.custom_id === rawId || e.custom_id === baseId) return true;
    if (e.custom_id && (rawId.includes(e.custom_id) || e.custom_id.includes(rawId))) return true;
    if (numericId && e.id === numericId) return true;
    return false;
  });

  if (season !== null && episode !== null && matches.length > 0) {
    const exact = matches.filter(row => Number(row.season) === season && Number(row.episode) === episode);
    matches = exact.length ? exact : filterAndSortByEpisode(matches, season, episode);
  } else if (episode !== null && matches.length > 0) {
    matches = filterAndSortByEpisode(matches, 1, episode);
  }

  matches.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  return matches;
}

/**
 * Helper to prioritize streams matching season and episode in title or custom_id
 */
function filterAndSortByEpisode(rows, season, episode) {
  const padEp = String(episode).padStart(2, '0');
  const padSe = String(season).padStart(2, '0');
  
  // Patterns like S01E03, S1E3, 1x03, Ep 03, E03
  const specificRegex = new RegExp(`(s0?${season}e0?${episode}|${season}x0?${episode}|ep(isode)?\\s*0?${episode}|cap(itulo)?\\s*0?${episode}|e0?${episode})`, 'i');

  const prioritized = [];
  const general = [];

  for (const row of rows) {
    const text = `${row.title} ${row.custom_id || ''} ${row.imdb_id || ''}`;
    if (specificRegex.test(text)) {
      prioritized.push(row);
    } else {
      general.push(row);
    }
  }

  // If specific episode streams exist, put them first followed by series packs
  return [...prioritized, ...general];
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

/**
 * Get Global Vault Stats
 */
async function getStats() {
  const p = getPool();
  if (p && isPgAvailable) {
    try {
      const totalRes = await p.query('SELECT COUNT(*) AS total, AVG(seeders) AS avg_seeders FROM hydra_vault');
      const byTypeRes = await p.query('SELECT type, COUNT(*) AS count FROM hydra_vault GROUP BY type');
      const byPlatformRes = await p.query('SELECT source_platform, COUNT(*) AS count FROM hydra_vault GROUP BY source_platform');

      const byType = {};
      byTypeRes.rows.forEach(r => { byType[r.type] = parseInt(r.count, 10); });

      const byPlatform = {};
      byPlatformRes.rows.forEach(r => { byPlatform[r.source_platform] = parseInt(r.count, 10); });

      return {
        total: parseInt(totalRes.rows[0].total, 10),
        avgSeeders: Math.round(parseFloat(totalRes.rows[0].avg_seeders) || 0),
        byType,
        byPlatform,
        dbMode: 'postgres'
      };
    } catch (err) {
      console.error('Error fetching stats from PostgreSQL:', err.message);
    }
  }

  // Memory Fallback
  initMemoryStore();
  const byType = {};
  const byPlatform = {};
  let totalSeeds = 0;

  memoryStore.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
    byPlatform[e.source_platform] = (byPlatform[e.source_platform] || 0) + 1;
    totalSeeds += (e.seeders || 0);
  });

  return {
    total: memoryStore.length,
    avgSeeders: memoryStore.length > 0 ? Math.round(totalSeeds / memoryStore.length) : 0,
    byType,
    byPlatform,
    dbMode: 'memory'
  };
}

/**
 * Bulk Insert Entries
 */
async function bulkInsert(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { inserted: 0, errors: [] };
  }

  const p = getPool();
  const inserted = [];
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    try {
      const created = await createEntry(raw);
      inserted.push(created);
    } catch (err) {
      errors.push({ index: i, title: raw.title || 'Unknown', error: err.message });
    }
  }

  return { inserted: inserted.length, items: inserted, errors };
}

/**
 * Re-seed Curated Data
 */
async function seedData() {
  return bulkInsert(SEED_ENTRIES);
}

module.exports = {
  initDb,
  checkHealth,
  getEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
  findStreamsForStremio,
  getCatalogItems,
  getStats,
  bulkInsert,
  seedData
};
