/**
 * POST /api/admin/import
 * Importa a hydra_vault un torrent encontrado por el buscador de webs.
 * Requiere cabecera x-admin-secret.
 *
 * Body JSON:
 *  - site:       dontorrent | mejortorrent | pelispanda | elitetorrent | sinsitio | limetorrent
 *  - detailUrl:  URL de la ficha en el sitio
 *  - title:      (opcional) sobrescribe el título
 *  - type:       movie | series | anime | drama (opcional; por defecto el detectado o movie)
 *  - season, episode: (opcionales) para series/anime
 *  - imdb_id / tmdb_id / kitsu_id / anilist_id / custom_id: (opcionales) para que Stremio lo resuelva
 *  - magnet:     (opcional) si ya se conoce, se usa tal cual sin volver a resolver
 *
 * Inserta TODAS las versiones encontradas en la ficha (calidades/audios distintos),
 * respetando el control de duplicados existente (409 en exactos).
 */
const config = require('../../src/config');
const db = require('../../src/db');
const scrapers = require('../../src/scrapers');
const { matchesSecret } = require('../../src/utils/adminAuth');

const ALLOWED_TYPES = new Set(['movie', 'series', 'anime', 'drama']);
const ALLOWED_SITES = new Set(['dontorrent', 'mejortorrent', 'pelispanda', 'elitetorrent', 'sinsitio', 'limetorrent']);

function text(value, max = 300) {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  return out ? out.slice(0, max) : null;
}

function guessType(result, fallback) {
  if (fallback && ALLOWED_TYPES.has(fallback)) return fallback;
  if (result.type && ALLOWED_TYPES.has(result.type)) return result.type;
  if (result.season !== null && result.season !== undefined) return 'series';
  return 'movie';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta POST.' });
  }

  const expectedSecret = config.adminSecret;
  if (!expectedSecret) {
    return res.status(503).json({ success: false, error: 'ADMIN_SECRET no está configurado en el servidor.' });
  }
  if (!matchesSecret(req.headers['x-admin-secret'], expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: x-admin-secret incorrecto o ausente.' });
  }

  const body = req.body || {};
  const site = String(body.site || '').toLowerCase();
  const detailUrl = text(body.detailUrl, 500);

  if (!ALLOWED_SITES.has(site)) {
    return res.status(400).json({ success: false, error: `site debe ser uno de: ${[...ALLOWED_SITES].join(', ')}.` });
  }
  if (!detailUrl && !/^magnet:\?xt=urn:btih:/i.test(String(body.magnet || ''))) {
    return res.status(400).json({ success: false, error: 'Falta detailUrl (o un magnet válido).' });
  }

  try {
    let resolved = [];
    if (detailUrl && !body.magnet) {
      resolved = await scrapers.resolveResult(site, detailUrl, { allowVose: true });
    }

    // Si no se resolvió ningún magnet pero el body trae uno, se usa ese.
    const candidates = [];
    if (resolved.length) {
      for (const result of resolved) {
        if (!result.magnet) continue;
        candidates.push({
          title: text(body.title) || result.title,
          magnet: result.magnet,
          quality: text(result.quality, 20) || '1080p',
          audio_lang: text(result.audio, 50) || 'Español',
          size: text(result.size, 20) || 'N/D',
          seeders: Number.isInteger(result.seeders) ? result.seeders : 10,
          season: body.season !== undefined && body.season !== null && body.season !== '' ? Number(body.season) : result.season,
          episode: body.episode !== undefined && body.episode !== null && body.episode !== '' ? Number(body.episode) : result.episode
        });
      }
    } else if (body.magnet) {
      candidates.push({
        title: text(body.title) || 'Importado de web',
        magnet: String(body.magnet),
        quality: text(body.quality, 20) || '1080p',
        audio_lang: text(body.audio_lang, 50) || 'Español',
        size: text(body.size, 20) || 'N/D',
        seeders: Number.isInteger(body.seeders) ? Number(body.seeders) : 10,
        season: /^\d+$/.test(String(body.season || '')) ? Number(body.season) : null,
        episode: /^\d+$/.test(String(body.episode || '')) ? Number(body.episode) : null
      });
    }

    if (!candidates.length) {
      return res.status(422).json({
        success: false,
        error: 'No se pudo extraer ningún magnet de esa ficha (el sitio puede estar caído o pedir verificación). Inténtalo de nuevo o pégalo a mano en "Pegar magnet".'
      });
    }

    const type = guessType(candidates[0], text(body.type, 20));
    const shared = {
      imdb_id: text(body.imdb_id, 50),
      tmdb_id: text(body.tmdb_id, 50),
      kitsu_id: text(body.kitsu_id, 50),
      anilist_id: text(body.anilist_id, 50),
      custom_id: text(body.custom_id, 100),
      type,
      source_platform: siteLabel(site)
    };

    const imported = [];
    const duplicated = [];
    for (const candidate of candidates.slice(0, 12)) {
      try {
        const row = await db.createEntry({ ...shared, ...candidate });
        imported.push(row);
      } catch (err) {
        const message = String(err && err.message || '');
        if (/duplicate|duplicad/i.test(message) || err.statusCode === 409) {
          duplicated.push(candidate.title);
        } else if (/temporada|episodio|capítulo/i.test(message)) {
          // season/episode incoherentes: reintenta como película completa
          const row = await db.createEntry({ ...shared, ...candidate, type: 'movie', season: null, episode: null });
          imported.push(row);
        } else {
          throw err;
        }
      }
    }

    return res.status(200).json({
      success: true,
      imported: imported.length,
      duplicated: duplicated.length,
      items: imported,
      skippedDuplicates: duplicated
    });
  } catch (err) {
    console.error('Scraper import error:', err.message);
    return res.status(502).json({
      success: false,
      error: 'No se pudo importar el contenido.',
      detail: err.message
    });
  }
};

function siteLabel(site) {
  const labels = {
    dontorrent: 'DonTorrent',
    mejortorrent: 'MejorTorrent',
    pelispanda: 'Pelispanda',
    elitetorrent: 'EliteTorrent',
    sinsitio: 'SinSitio',
    limetorrent: 'LimeTorrent'
  };
  return labels[site] || 'Torrent';
}
