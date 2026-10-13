const db = require('../db');
const scrapers = require('../scrapers');
const { cleanShowName, posterFor, backgroundFor, createFallbackPoster } = require('../utils/titles');
const { scrapId } = require('../scrapers/streams');
const { normalizeTitle } = require('../scrapers/language');

const SCRAPER_CATALOGS = {
  hydra_torrent_movies: { type: 'movie' },
  hydra_torrent_series: { type: 'series' },
  hydra_torrent_anime: { type: 'anime' }
};

function parseExtra(req) {
  let genre = req.query.genre || null;
  let search = req.query.search || null;
  let skip = req.query.skip ? parseInt(req.query.skip, 10) || 0 : 0;

  if (req.params.extra) {
    const params = new URLSearchParams(req.params.extra.replace(/\.json$/, ''));
    if (params.get('genre')) genre = params.get('genre');
    if (params.get('search')) search = params.get('search');
    if (params.get('skip')) skip = parseInt(params.get('skip'), 10) || 0;
  }
  return { genre, search, skip };
}

/** Convierte resultados de scrapers en metas de Stremio agrupados por título. */
function resultsToMetas(results, { skip = 0, limit = 50 } = {}) {
  const seen = new Set();
  const metas = [];

  for (const result of results) {
    if (!result.detailUrl) continue;
    const name = cleanShowName(result.title, result.type === 'movie' ? 'movie' : 'series');
    const key = normalizeTitle(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const id = scrapId(result.site, result.detailUrl);
    const stremioType = result.type === 'anime' ? 'anime' : (result.type === 'movie' ? 'movie' : 'series');
    const badges = [result.siteLabel, result.audio, result.quality !== 'N/D' ? result.quality : null, result.size]
      .filter(Boolean).join(' • ');

    metas.push({
      id,
      type: stremioType,
      name,
      genres: [result.siteLabel, result.audio || 'Español', result.quality !== 'N/D' ? result.quality : null].filter(Boolean),
      poster: result.poster || createFallbackPoster(name, result.siteLabel || 'Web', result.quality),
      posterShape: 'poster',
      description: `${badges}\n🌐 Contenido de habla hispana encontrado en la web.`,
      releaseInfo: result.year ? String(result.year) : undefined
    });

    if (metas.length >= skip + limit) break;
  }

  return metas.slice(skip, skip + limit);
}

/**
 * GET /catalog/:type/:id.json y GET /catalog/:type/:id/:extra.json
 * - Catálogos de la bóveda: un elemento por título guardado.
 * - Catálogos hydra_torrent_*: búsqueda EN VIVO en las webs torrent en español.
 */
async function handleCatalogRequest(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  const { type, id } = req.params;
  const catalogId = id.replace(/\.json$/, '');
  const { genre, search, skip } = parseExtra(req);

  try {
    // ------------------------------------------------------------------
    // Catálogos en vivo (buscador de webs torrent)
    // ------------------------------------------------------------------
    if (SCRAPER_CATALOGS[catalogId]) {
      const wantedType = SCRAPER_CATALOGS[catalogId].type;
      let results = [];
      if (search && search.trim()) {
        ({ results } = await scrapers.searchAll({ query: search.trim(), type: wantedType }));
      } else {
        results = await scrapers.latestAll({});
        results = results.filter(result => !result.type || result.type === wantedType);
      }
      return res.json({ metas: resultsToMetas(results, { skip, limit: 50 }) });
    }

    // ------------------------------------------------------------------
    // Catálogos de la bóveda (comportamiento original)
    // ------------------------------------------------------------------
    const rows = await db.getCatalogItems({ catalogId, type, genre, search, skip, limit: 50 });

    const metas = rows.map(item => {
      const name = cleanShowName(item.title, item.type);
      const genres = [item.source_platform, item.audio_lang, item.subtitles && `Subs: ${item.subtitles}`, item.quality].filter(Boolean);
      return {
        id: item.group_key || db.groupKey(item),
        type: item.type === 'drama' ? 'series' : item.type,
        name,
        genres,
        poster: posterFor(item, name),
        posterShape: 'poster',
        description: `${item.source_platform || 'Hydra'} • ${item.quality || '1080p'} • Audio: ${item.audio_lang || 'Multi'} • Subs: ${item.subtitles || 'Multi'}`
      };
    });

    return res.json({ metas });
  } catch (err) {
    console.error('Error handling catalog request:', err.message);
    return res.json({ metas: [] });
  }
}

module.exports = {
  handleCatalogRequest
};
