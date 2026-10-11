const db = require('../db');
const config = require('../config');
const prowlarr = require('../services/prowlarr');
const { resolveExternalTitle } = require('../utils/titleResolver');
const { formatStremioStream } = require('../utils/magnet');

/**
 * Auto-fill pipeline: cuando Stremio pide algo que NO está en la BD,
 * se busca en Prowlarr, se cachean los resultados en hydra_vault (dedup por
 * infohash) y se devuelven como streams. Así la BD se alimenta con la demanda real.
 */
async function autoFillStreams(ctx) {
  if (ctx.needsTitle) {
    // kitsu:/anilist: → resolvemos el título canónico (Kitsu/AniList) para buscar por texto
    const title = await resolveExternalTitle({
      kind: ctx.titleKind,
      externalId: ctx.titleId
    });
    if (!title) return [];
    ctx.query = prowlarr.buildAnimeQuery(title, ctx.episode);
  }

  const results = await prowlarr.searchProwlarr(ctx);
  if (!results.length) return [];

  await db.ingestAutoEntries(prowlarr.toVaultEntries(results, ctx));
  return db.findStreamsForStremio({ type: ctx.stremioType, id: ctx.id });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Handles GET /stream/:type/:id.json requests
 */
async function handleStreamRequest(req, res) {
  const { type, id } = req.params;

  // Clean id by stripping .json if present in the param
  const cleanId = id.replace(/\.json$/, '');

  try {
    let rows = await db.findStreamsForStremio({ type, id: cleanId });
    let cacheable = rows.length > 0;

    // Bajo demanda: si no hay streams en la BD, intentamos auto-llenar vía Prowlarr
    if (rows.length === 0 && prowlarr.isConfigured()) {
      const ctx = prowlarr.buildSearchFromStreamId({ type, id: cleanId });
      if (ctx) {
        const task = autoFillStreams(ctx);
        // Si ganara el timeout, la búsqueda sigue en background y cachea en la BD
        task.catch(err => console.error('Prowlarr background fill error:', err.message));
        try {
          rows = await withTimeout(task, config.prowlarr.timeoutMs, 'Prowlarr fill');
          cacheable = rows.length > 0;
        } catch (err) {
          console.warn(`Prowlarr: ${err.message} — devolviendo vacío; el resultado quedará cacheado para el reintento.`);
          rows = [];
          cacheable = false;
        }
      }
    }

    // Solo cacheamos respuestas con streams: un vacío debe reintentarse pronto
    if (cacheable) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    const streams = rows.map(formatStremioStream);
    return res.json({ streams });
  } catch (err) {
    console.error(`Error resolving streams for type=${type}, id=${cleanId}:`, err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ streams: [] });
  }
}

module.exports = {
  handleStreamRequest
};
