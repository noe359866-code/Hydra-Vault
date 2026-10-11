/**
 * Prowlarr Search Service (Torznab proxy)
 * Busca torrents bajo demanda cuando Stremio pide un título que no está en hydra_vault.
 * - Búsqueda por IMDb/TMDb id o por texto (anime resuelto vía Kitsu/AniList).
 * - Normaliza resultados a entradas del esquema hydra_vault con dedup por infohash.
 * - El fetch es inyectable para pruebas; sin dependencias externas (fetch nativo).
 */

const config = require('../config');
const { parseMagnet, buildMagnet, formatBytes } = require('../utils/magnet');

// Categorías Torznab estándar
const CATEGORY = {
  MOVIES: 2000,
  TV: 5000,
  ANIME: 5070
};

function isConfigured() {
  return Boolean(config.prowlarr.url && config.prowlarr.apiKey);
}

/**
 * Estado de la conexión con Prowlarr (para /api/health y el script de comprobación).
 * Nunca devuelve la API key.
 */
async function checkHealth(opts = {}) {
  if (!isConfigured()) {
    return {
      configured: false,
      connected: false,
      message: 'Prowlarr no configurado (define PROWLARR_API_KEY; opcionalmente PROWLARR_URL)'
    };
  }

  const fetchImpl = opts.fetchImpl || global.fetch;
  const timeoutMs = opts.timeoutMs || 2000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetchImpl(`${config.prowlarr.url}/api/v1/system/status`, {
      method: 'GET',
      headers: {
        'X-Api-Key': config.prowlarr.apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { configured: true, connected: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => null);
    return {
      configured: true,
      connected: true,
      latencyMs,
      instance: (data && (data.instanceName || data.appName)) || 'Prowlarr',
      version: (data && data.version) || null
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      latencyMs: Date.now() - start,
      error: err.name === 'AbortError' ? `timeout tras ${timeoutMs}ms` : err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function validInfoHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(hash) ? hash : null;
}

/**
 * Construye el contexto de búsqueda a partir de un stream id de Stremio.
 * Formatos soportados (los mismos que findStreamsForStremio):
 *   tt1234567 | tt1234567:1:2 | kitsu:41370 | kitsu:41370:5 | anilist:21:3 | tmdb:123 | tmdb:123:1:1
 * Devuelve null cuando no hay búsqueda automática posible (custom/hydra/numérico).
 */
function buildSearchFromStreamId({ type, id }) {
  const rawId = String(id || '').trim();
  if (!rawId) return null;
  const parts = rawId.split(':');
  const stremioType = type === 'movie' ? 'movie' : 'series';

  const ctx = {
    id: rawId,
    stremioType,
    vaultType: stremioType === 'movie' ? 'movie' : 'series',
    imdb_id: null,
    tmdb_id: null,
    anilist_id: null,
    kitsu_id: null,
    custom_id: null,
    season: null,
    episode: null,
    query: '',
    imdbId: null,
    tmdbId: null,
    searchType: 'search',
    categories: [],
    needsTitle: false,
    titleKind: null,
    titleId: null
  };

  // IMDb: tt1234567[:season:episode]
  if (/^tt\d+$/.test(parts[0])) {
    ctx.imdb_id = parts[0];
    ctx.imdbId = parts[0];
    if (parts.length >= 3) {
      ctx.season = parseInt(parts[1], 10) || null;
      ctx.episode = parseInt(parts[2], 10) || null;
      ctx.searchType = 'tvsearch';
      ctx.vaultType = 'series';
      ctx.categories = [CATEGORY.TV];
    } else if (stremioType === 'movie') {
      ctx.searchType = 'movie';
      ctx.categories = [CATEGORY.MOVIES];
    } else {
      ctx.searchType = 'tvsearch';
      ctx.categories = [CATEGORY.TV];
    }
    return ctx;
  }

  // TMDb: tmdb:12345[:season:episode]
  if (rawId.startsWith('tmdb:') && parts.length >= 2 && /^\d+$/.test(parts[1])) {
    ctx.tmdb_id = parts[1];
    ctx.tmdbId = parts[1];
    if (parts.length >= 4) {
      ctx.season = parseInt(parts[2], 10) || null;
      ctx.episode = parseInt(parts[3], 10) || null;
      ctx.searchType = 'tvsearch';
      ctx.vaultType = 'series';
      ctx.categories = [CATEGORY.TV];
    } else if (stremioType === 'movie') {
      ctx.searchType = 'movie';
      ctx.categories = [CATEGORY.MOVIES];
    } else {
      ctx.searchType = 'tvsearch';
      ctx.categories = [CATEGORY.TV];
    }
    return ctx;
  }

  // Kitsu: kitsu:41370[:episode] (anime → temporada implícita 1)
  if (rawId.startsWith('kitsu:') && parts.length >= 2 && /^\d+$/.test(parts[1])) {
    ctx.kitsu_id = parts[1];
    if (parts.length >= 3) {
      ctx.season = 1;
      ctx.episode = parseInt(parts[2], 10) || null;
    }
    ctx.vaultType = 'anime';
    ctx.searchType = 'search';
    ctx.categories = [CATEGORY.ANIME];
    ctx.needsTitle = true;
    ctx.titleKind = 'kitsu';
    ctx.titleId = parts[1];
    return ctx;
  }

  // AniList: anilist:21[:episode]
  if (rawId.startsWith('anilist:') && parts.length >= 2 && /^\d+$/.test(parts[1])) {
    ctx.anilist_id = parts[1];
    if (parts.length >= 3) {
      ctx.season = 1;
      ctx.episode = parseInt(parts[2], 10) || null;
    }
    ctx.vaultType = 'anime';
    ctx.searchType = 'search';
    ctx.categories = [CATEGORY.ANIME];
    ctx.needsTitle = true;
    ctx.titleKind = 'anilist';
    ctx.titleId = parts[1];
    return ctx;
  }

  // hydra:<id>, custom o numérico → sin búsqueda automática (no sabemos qué título es)
  return null;
}

/**
 * Query de texto para anime: "Title 05" (convención habitual en indexers anime)
 */
function buildAnimeQuery(title, episode) {
  const clean = String(title || '').trim();
  if (!clean) return '';
  if (episode === null || episode === undefined) return clean;
  return `${clean} ${String(episode).padStart(2, '0')}`;
}

/**
 * Normaliza la respuesta de Prowlarr (/api/v1/search) a releases admitidos:
 * solo torrents con infohash/magnet (convertibles a stream Stremio), dedup por infohash.
 */
function normalizeResults(items) {
  const out = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    if (item && item.protocol && item.protocol !== 'torrent') continue;

    const magnet = item && item.magnetUrl ? String(item.magnetUrl) : null;
    const parsed = magnet ? parseMagnet(magnet) : null;
    const infoHash = validInfoHash(item && item.infoHash) || (parsed && validInfoHash(parsed.infoHash));
    if (!infoHash) continue; // solo .torrent sin magnet/infohash → no convertibles a stream
    if (seen.has(infoHash)) continue;

    const seeders = Number(item.seeders);
    const safeSeeders = Number.isFinite(seeders) && seeders >= 0 ? Math.round(seeders) : 0;
    if (safeSeeders < config.prowlarr.minSeeders) continue;

    seen.add(infoHash);

    const title = String(item.title || item.fileName || '').trim() || `Release ${infoHash.slice(0, 8)}`;
    const indexerName = typeof item.indexer === 'string'
      ? item.indexer
      : (item.indexer && item.indexer.name) || (item.indexerId ? `indexer-${item.indexerId}` : 'Prowlarr');

    out.push({
      title,
      infoHash,
      magnet: magnet || buildMagnet(infoHash, title),
      sizeBytes: Number(item.size) || 0,
      size: formatBytes(item.size) || 'N/D',
      seeders: safeSeeders,
      peers: Number.isFinite(Number(item.peers)) ? Number(item.peers) : 0,
      indexer: String(indexerName).slice(0, 100),
      publishDate: item.publishDate || null
    });
  }

  out.sort((a, b) => b.seeders - a.seeders);
  return out.slice(0, Math.max(1, config.prowlarr.maxResults));
}

/**
 * Ejecuta una búsqueda en Prowlarr.
 * @param {object} search - contexto de buildSearchFromStreamId (o equivalente)
 * @param {{ fetchImpl?: Function, timeoutMs?: number }} [opts]
 */
async function searchProwlarr(search, opts = {}) {
  if (!isConfigured()) throw new Error('Prowlarr no está configurado (PROWLARR_URL / PROWLARR_API_KEY)');

  const fetchImpl = opts.fetchImpl || global.fetch;
  const timeoutMs = opts.timeoutMs || (config.prowlarr.timeoutMs + config.prowlarr.graceMs);

  const params = new URLSearchParams();
  if (search.query) params.set('query', search.query);
  params.set('type', search.searchType || 'search');
  if (search.imdbId) params.set('imdbId', search.imdbId);
  if (search.tmdbId) params.set('tmdbId', search.tmdbId);
  if (search.searchType === 'tvsearch' && search.season !== null && search.season !== undefined) {
    params.set('season', String(search.season));
    if (search.episode !== null && search.episode !== undefined) params.set('ep', String(search.episode));
  }
  if (Array.isArray(search.categories) && search.categories.length > 0) {
    params.set('categories', search.categories.join(','));
  }
  params.set('limit', String(Math.max(1, config.prowlarr.maxResults) * 2));
  params.set('offset', '0');

  const url = `${config.prowlarr.url}/api/v1/search?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': config.prowlarr.apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Prowlarr respondió HTTP ${res.status}`);
    const data = await res.json();
    return normalizeResults(data);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Meta de episodio inferida del título del release (SxxEyy / NxNN / anime " - 05").
 * Devuelve { season, episode } o null si no hay patrón completo.
 */
function parseEpisodeMeta(title) {
  const t = String(title || '');
  let m = t.match(/\bS(\d{1,2})[\s._-]?E(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  m = t.match(/\b(\d{1,2})x(\d{2,3})\b/);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  // Anime: "Show - 05 [1080p]", "Show - 05v2", "Show E05", "Show EP 05"
  m = t.match(/\s-\s(\d{1,4})(?:v\d)?(?:\s|[\[\(]|$)/);
  if (m) return { season: 1, episode: parseInt(m[1], 10) };

  m = t.match(/\bE[Pp]?[\s._-]?(\d{1,4})\b/);
  if (m) return { season: 1, episode: parseInt(m[1], 10) };

  return null;
}

function guessQuality(title) {
  const t = String(title || '');
  if (/\b(2160p|4k|uhd)\b/i.test(t)) return '4K';
  if (/\b1080p?\b/i.test(t)) return '1080p';
  if (/\b720p\b/i.test(t)) return '720p';
  if (/\b(576p|480p|360p)\b/i.test(t)) return '480p';
  return '1080p';
}

function guessAudioLang(title) {
  const t = String(title || '').toLowerCase();
  if (/\bdual\b/.test(t)) return 'Dual';
  if (/\blatino\b|\blat\b/.test(t)) return 'Latino';
  if (/\bcastellano\b|\bespañol\b|\bespanol\b|\bspa\b/.test(t)) return 'Español';
  if (/\bjap(ones|anese)?\b|\bjpn\b/.test(t)) return 'Japonés';
  return 'Multi';
}

function guessSubtitles(title) {
  const t = String(title || '').toLowerCase();
  if (/\bsub(s|bed)?[\s._-]*(esp|spa|español|espanol|spanish)\b/.test(t)) return 'Español';
  if (/\bsub(s|bed)?[\s._-]*(eng|ingl|english)\b/.test(t)) return 'Inglés';
  return 'Multi';
}

/**
 * Convierte releases normalizados en filas listas para hydra_vault.
 * Etiqueta temporada/episodio desde el título del release o, en su defecto,
 * desde el contexto de la petición (búsqueda por episodio concreto).
 */
function toVaultEntries(results, ctx) {
  return (results || []).map((r) => {
    const meta = parseEpisodeMeta(r.title);
    let season = meta ? meta.season : (ctx.season !== undefined ? ctx.season : null);
    let episode = meta ? meta.episode : (ctx.episode !== undefined ? ctx.episode : null);
    if (episode !== null && episode !== undefined && (season === null || season === undefined)) {
      season = 1; // anime/episodio suelto → temporada 1
    }
    if (ctx.vaultType === 'movie') {
      season = null;
      episode = null;
    }

    return {
      imdb_id: ctx.imdb_id || null,
      tmdb_id: ctx.tmdb_id || null,
      anilist_id: ctx.anilist_id || null,
      kitsu_id: ctx.kitsu_id || null,
      custom_id: ctx.custom_id || null,
      type: ctx.vaultType || 'movie',
      season: season === undefined ? null : season,
      episode: episode === undefined ? null : episode,
      episode_title: null,
      source_platform: 'Prowlarr',
      title: r.title,
      magnet: r.magnet,
      quality: guessQuality(r.title),
      audio_lang: guessAudioLang(r.title),
      subtitles: guessSubtitles(r.title),
      size: r.size,
      seeders: r.seeders,
      infohash: r.infoHash,
      added_via: 'prowlarr',
      indexer: r.indexer
    };
  });
}

module.exports = {
  isConfigured,
  checkHealth,
  buildSearchFromStreamId,
  buildAnimeQuery,
  searchProwlarr,
  normalizeResults,
  parseEpisodeMeta,
  guessQuality,
  guessAudioLang,
  guessSubtitles,
  toVaultEntries,
  CATEGORY
};
