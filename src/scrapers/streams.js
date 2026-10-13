/**
 * Puente scrapers → streams de Stremio.
 *
 * - Para IDs con título en la bóveda (tt…, tmdb:…, kitsu:…): busca el título en
 *   todas las webs, se queda SOLO con releases de habla hispana que coincidan
 *   con el título y el episodio pedido, y resuelve los magnets de los mejores.
 * - Para IDs `hydra:scrap-<site>-<base64>` (catálogo del buscador): resuelve la
 *   ficha del sitio directamente.
 *
 * Todo con caché TTL para no golpear las webs en cada cambio de episodio.
 */

const db = require('../db');
const { cleanShowName } = require('../utils/titles');
const scrapers = require('./index');
const { splitQuery } = require('./base');
const { releaseMatchesTitle, parseSeasonEpisode, parseQuality } = require('./language');
const { parseMagnet, formatStremioStream } = require('../utils/magnet');

function enabled() {
  return String(process.env.SCRAPER_STREAMS_ENABLED || 'true') !== 'false';
}

const SCRAP_ID_RE = /^scrap-([a-z0-9_]+)-([A-Za-z0-9\-_]+)$/;

/** Construye un ID de Stremio para un resultado del catálogo del buscador. */
function scrapId(site, detailUrl) {
  const encoded = Buffer.from(String(detailUrl), 'utf8').toString('base64url');
  return `hydra:scrap-${site}-${encoded}`;
}

function decodeScrapId(id) {
  const clean = String(id || '').replace(/\.json$/, '');
  const match = clean.match(/^(?:hydra:)?scrap-([a-z0-9_]+)-([A-Za-z0-9\-_]+)$/);
  if (!match) return null;
  try {
    return { site: match[1], detailUrl: Buffer.from(match[2], 'base64url').toString('utf8') };
  } catch {
    return null;
  }
}

/**
 * Filtra resultados por título y episodio.
 */
function filterForRequest(results, { title, type, season, episode }) {
  const wanted = title ? cleanShowName(title, type === 'movie' ? 'movie' : 'series') : null;
  return results.filter(result => {
    if (wanted && !releaseMatchesTitle(result.title, wanted)) return false;
    if (episode === null || episode === undefined) return true;

    const info = parseSeasonEpisode(result.title);
    // Episodio concreto encontrado en el nombre.
    if (info.episode !== null) {
      if (info.season !== null && season !== null && info.season !== season) return false;
      return info.episode === episode;
    }
    // Packs: "Cap. 1-8" o "temporada completa" sirven como respaldo.
    if (info.isPack) return true;
    // Sin marca de episodio (películas o fichas genéricas): se acepta como pack.
    return true;
  });
}

/**
 * Resuelve magnets de los primeros N resultados de cada sitio (en paralelo).
 */
async function hydrateTop(results, { perSite = 2, maxTotal = 8 } = {}) {
  const bySite = new Map();
  for (const result of results) {
    if (result.magnet) continue;
    if (!bySite.has(result.site)) bySite.set(result.site, []);
    const list = bySite.get(result.site);
    if (list.length < perSite) list.push(result);
  }

  const jobs = [];
  for (const [site, items] of bySite.entries()) {
    for (const item of items) {
      jobs.push(
        scrapers.resolveResult(site, item).then(resolved => {
          if (resolved && resolved.length) {
            const best = resolved.find(r => r.magnet);
            if (best) {
              item.magnet = best.magnet;
              item.infoHash = best.infoHash;
              item.seeders = item.seeders || best.seeders;
              item.size = item.size || best.size;
              item.needsResolution = false;
            }
          }
        }).catch(() => {})
      );
    }
    if (jobs.length >= maxTotal) break;
  }
  await Promise.allSettled(jobs);
  return results.filter(result => result.magnet);
}

/** Ordena: más seeds primero, luego calidad. */
const QUALITY_ORDER = { '4K': 0, Remux: 1, '1080p': 2, MicroHD: 3, BDrip: 4, 'WEB-DL': 5, HEVC: 6, WEBRip: 7, '720p': 8, DVDRip: 9, HDTV: 10, '480p': 11, Screener: 12 };
function sortResults(a, b) {
  const q = (QUALITY_ORDER[a.quality] ?? 20) - (QUALITY_ORDER[b.quality] ?? 20);
  if (q !== 0) return q;
  return (b.seeders || 0) - (a.seeders || 0);
}

/** Convierte un resultado de scraper en una "fila" compatible con formatStremioStream. */
function toStreamRow(result) {
  const parsed = parseMagnet(result.magnet);
  return {
    title: `${result.title}${result.audio ? ` [${result.audio}]` : ''}`,
    magnet: result.magnet,
    quality: result.quality && result.quality !== 'N/D' ? result.quality : (parseQuality(result.title) || '1080p'),
    audio_lang: result.audio || 'Español',
    subtitles: /vose|sub/i.test(`${result.audio} ${result.extraText || ''}`) ? 'Español' : 'N/D',
    size: result.size || 'N/D',
    seeders: Number.isInteger(result.seeders) ? result.seeders : 10,
    source_platform: result.siteLabel || result.site,
    badge: `🌐 Torrent Web • ${result.siteLabel || result.site} • Español`
  };
}

/**
 * Punto de entrada para handleStreamRequest.
 * @returns {Promise<object[]>} streams de Stremio (ya formateados)
 */
async function streamsFromScrapers({ type, id, dbRows = [] }) {
  if (!enabled()) return [];
  const maxStreams = Number(process.env.SCRAPER_MAX_STREAMS) || 8;

  // 1) IDs del catálogo del buscador: resolver la ficha directamente.
  const scrap = decodeScrapId(id);
  if (scrap) {
    const resolved = await scrapers.resolveResult(scrap.site, scrap.detailUrl);
    return resolved.filter(r => r.magnet).sort(sortResults).slice(0, maxStreams)
      .map(toStreamRow)
      .map(formatStremioStream);
  }

  // 2) Título conocido por la bóveda (imdb/tmdb/kitsu…).
  const firstRow = dbRows.find(row => row.title);
  if (!firstRow) return [];

  const parsed = require('../utils/episodes').parseStremioId(id);
  const title = cleanShowName(firstRow.title, firstRow.type);
  const season = parsed.season !== undefined ? parsed.season : null;
  const episode = parsed.episode !== undefined ? parsed.episode : null;

  const { results } = await scrapers.searchAll({ query: title, type: null });
  const filtered = filterForRequest(results, { title, type: firstRow.type, season, episode });
  if (!filtered.length) return [];

  const hydrated = await hydrateTop(filtered, { perSite: 2, maxTotal: 10 });
  return hydrated
    .sort(sortResults)
    .slice(0, maxStreams)
    .map(toStreamRow)
    .map(formatStremioStream);
}

module.exports = {
  streamsFromScrapers,
  filterForRequest,
  hydrateTop,
  scrapId,
  decodeScrapId,
  toStreamRow,
  sortResults,
  enabled
};
