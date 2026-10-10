/**
 * Layerbase PostgreSQL Client & Pool
 * Official 'pg' client configuration for Vercel Serverless and Node.js
 */

const { Pool } = require('pg');

let pool = null;
let schemaReady = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS hydra_vault (
    id SERIAL PRIMARY KEY,
    imdb_id VARCHAR(50),
    tmdb_id VARCHAR(50),
    anilist_id VARCHAR(50),
    kitsu_id VARCHAR(50),
    custom_id VARCHAR(100),
    type VARCHAR(20) NOT NULL,
    season INTEGER CHECK (season IS NULL OR season >= 0),
    episode INTEGER CHECK (episode IS NULL OR episode >= 1),
    episode_title TEXT,
    source_platform VARCHAR(50) DEFAULT 'Torrent',
    title TEXT NOT NULL,
    magnet TEXT NOT NULL,
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
`;

async function ensureSchema(poolClient) {
  if (!schemaReady) {
    schemaReady = poolClient.query(SCHEMA_SQL).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

// Initial curated seed data for local preview / mock mode
const SEED_DATA = [
  {
    id: 1,
    imdb_id: 'tt21344706',
    tmdb_id: '136283',
    anilist_id: null,
    kitsu_id: null,
    custom_id: 'viki-the-glory-s01',
    type: 'drama',
    source_platform: 'Viki',
    title: 'The Glory S01 1080p Viki WebRip Dual Latino',
    magnet: 'magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=The+Glory+S01+1080p+Viki&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
    quality: '1080p',
    audio_lang: 'Latino / Coreano',
    subtitles: 'Español',
    size: '14.2 GB',
    seeders: 85,
    created_at: new Date('2026-01-01')
  },
  {
    id: 2,
    imdb_id: 'tt21817112',
    tmdb_id: '207647',
    anilist_id: null,
    kitsu_id: null,
    custom_id: 'iqiyi-love-between-fairy-devil',
    type: 'drama',
    source_platform: 'iQiyi',
    title: 'Love Between Fairy and Devil 4K UHD iQiyi Exclusivo Multi-Sub',
    magnet: 'magnet:?xt=urn:btih:a1b2c3d4e5f60718293a4b5c6d7e8f9012345678&dn=Love+Between+Fairy+and+Devil+4K&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
    quality: '4K',
    audio_lang: 'Sub Español',
    subtitles: 'Español',
    size: '28.4 GB',
    seeders: 77,
    created_at: new Date('2026-01-02')
  },
  {
    id: 3,
    imdb_id: 'tt22394142',
    tmdb_id: '209867',
    anilist_id: '154587',
    kitsu_id: '46474',
    custom_id: 'anime-frieren-s01',
    type: 'anime',
    source_platform: 'Torrent',
    title: 'Sousou no Frieren S01 1080p Dual Audio [Latino - Japonés]',
    magnet: 'magnet:?xt=urn:btih:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b&dn=Frieren+S01+1080p+Latino&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
    quality: '1080p',
    audio_lang: 'Latino / Japonés',
    subtitles: 'Español',
    size: '15.6 GB',
    seeders: 140,
    created_at: new Date('2026-01-03')
  }
];

let memoryStore = [...SEED_DATA];
let nextMemoryId = 4;

function getPool() {
  const connectionString = process.env.LAYERBASE_DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      // Keep the connection footprint small when Vercel scales serverless instances.
      max: process.env.PG_MAX ? parseInt(process.env.PG_MAX, 10) : 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 6000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle Layerbase PostgreSQL client:', err.message);
    });
  }
  return pool;
}

/**
 * Execute SQL Query
 */
async function query(text, params = []) {
  const p = getPool();
  if (p) {
    return p.query(text, params);
  }

  // Memory Fallback
  return mockQuery(text, params);
}

/**
 * Find Streams by Multiple Identifiers
 */
async function findStreamsById(id) {
  if (!id) return [];
  const cleanId = String(id).trim();
  const idParts = cleanId.split(':');
  const isNamespacedId = ['kitsu', 'anilist', 'tmdb', 'hydra'].includes(idParts[0]);
  const baseId = cleanId.startsWith('tt') ? idParts[0] : (isNamespacedId ? (idParts[1] || cleanId) : idParts[0]);
  const numericCandidate = /^\d+$/.test(cleanId) ? cleanId : (idParts[0] === 'hydra' ? idParts[1] : baseId);
  const parsedNumericId = /^\d+$/.test(numericCandidate || '') ? Number(numericCandidate) : null;
  const numericId = Number.isSafeInteger(parsedNumericId) && parsedNumericId <= 2147483647 ? parsedNumericId : null;

  const p = getPool();
  if (p) {
    await ensureSchema(p);
    const sql = `
      SELECT * FROM hydra_vault 
      WHERE imdb_id = $1 OR imdb_id = $2
         OR tmdb_id = $1 OR tmdb_id = $2
         OR anilist_id = $1 OR anilist_id = $2
         OR kitsu_id = $1 OR kitsu_id = $2
         OR custom_id = $1 OR custom_id = $2
         OR ($3::integer IS NOT NULL AND id = $3::integer)
      ORDER BY seeders DESC, created_at DESC;
    `;
    const res = await p.query(sql, [cleanId, baseId, numericId]);
    return res.rows;
  }

  // Memory Store Fallback
  return memoryStore.filter(row => {
    return (
      row.imdb_id === cleanId || row.imdb_id === baseId ||
      row.tmdb_id === cleanId || row.tmdb_id === baseId ||
      row.anilist_id === cleanId || row.anilist_id === baseId ||
      row.kitsu_id === cleanId || row.kitsu_id === baseId ||
      row.custom_id === cleanId || row.custom_id === baseId ||
      (numericId !== null && row.id === numericId)
    );
  }).sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
}

/**
 * Insert Entry into hydra_vault
 */
async function insertEntry(data) {
  const {
    imdb_id = null,
    tmdb_id = null,
    anilist_id = null,
    kitsu_id = null,
    custom_id = null,
    type,
    source_platform = 'Torrent',
    title,
    magnet,
    quality = '1080p',
    audio_lang = 'Multi',
    subtitles = 'Multi',
    size = 'N/D',
    seeders = 10
  } = data;

  const p = getPool();
  if (p) {
    await ensureSchema(p);
    const sql = `
      INSERT INTO hydra_vault (
        imdb_id, tmdb_id, anilist_id, kitsu_id, custom_id,
        type, source_platform, title, magnet,
        quality, audio_lang, subtitles, size, seeders
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      ) RETURNING *;
    `;
    const values = [
      imdb_id ? String(imdb_id).trim() : null,
      tmdb_id ? String(tmdb_id).trim() : null,
      anilist_id ? String(anilist_id).trim() : null,
      kitsu_id ? String(kitsu_id).trim() : null,
      custom_id ? String(custom_id).trim() : null,
      type ? String(type).trim() : 'drama',
      source_platform ? String(source_platform).trim() : 'Torrent',
      String(title).trim(),
      String(magnet).trim(),
      quality ? String(quality).trim() : '1080p',
      audio_lang ? String(audio_lang).trim() : 'Multi',
      subtitles ? String(subtitles).trim() : 'Multi',
      size ? String(size).trim() : 'N/D',
      Number.isInteger(parseInt(seeders, 10)) ? parseInt(seeders, 10) : 10
    ];

    const res = await p.query(sql, values);
    return res.rows[0];
  }

  // Memory fallback insertion
  const newRow = {
    id: nextMemoryId++,
    imdb_id: imdb_id ? String(imdb_id).trim() : null,
    tmdb_id: tmdb_id ? String(tmdb_id).trim() : null,
    anilist_id: anilist_id ? String(anilist_id).trim() : null,
    kitsu_id: kitsu_id ? String(kitsu_id).trim() : null,
    custom_id: custom_id ? String(custom_id).trim() : null,
    type: String(type).trim(),
    source_platform: source_platform ? String(source_platform).trim() : 'Torrent',
    title: String(title).trim(),
    magnet: String(magnet).trim(),
    quality: quality ? String(quality).trim() : '1080p',
    audio_lang: audio_lang ? String(audio_lang).trim() : 'Multi',
    subtitles: subtitles ? String(subtitles).trim() : 'Multi',
    size: size ? String(size).trim() : 'N/D',
    seeders: Number.isInteger(parseInt(seeders, 10)) ? parseInt(seeders, 10) : 10,
    created_at: new Date()
  };
  memoryStore.unshift(newRow);
  return newRow;
}

/**
 * Simple mock query simulation for memory mode
 */
function mockQuery(text, params) {
  return { rows: memoryStore };
}

module.exports = {
  getPool,
  query,
  findStreamsById,
  insertEntry,
  memoryStore
};
