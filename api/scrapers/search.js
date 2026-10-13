/**
 * GET /api/scrapers/search?q=<término>&type=movie|series|anime&season=&episode=&sites=a,b&limit=
 * Busca UNA solicitud en todos los sitios torrent en español en paralelo.
 *
 * - Devuelve contenido SOLO de habla hispana (latino, castellano, sub español).
 * - Los magnets no se descargan aquí (rápido); cada resultado trae su detailUrl
 *   y site para resolverlos con POST /api/admin/import.
 * - Con ?resolve=1 se hidratan (con ToS de tiempo) los primeros N resultados.
 */
const scrapers = require('../../src/scrapers');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta GET.' });
  }

  const query = req.query || {};
  const term = typeof query.q === 'string' ? query.q.trim() : '';
  if (!term) {
    return res.status(400).json({ success: false, error: 'Falta el parámetro de búsqueda "q".' });
  }
  if (term.length > 120) {
    return res.status(400).json({ success: false, error: 'El término de búsqueda es demasiado largo.' });
  }

  const type = ['movie', 'series', 'anime'].includes(query.type) ? query.type : null;
  const season = /^\d+$/.test(String(query.season || '')) ? Number(query.season) : null;
  const episode = /^\d+$/.test(String(query.episode || '')) ? Number(query.episode) : null;
  const sites = typeof query.sites === 'string' && query.sites.trim()
    ? query.sites.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : null;
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 40, 1), 100);
  const shouldResolve = String(query.resolve || '') === '1';

  try {
    const { results, errors } = await scrapers.searchAll({ query: term, type, season, episode, sites });

    let hydrated = results;
    if (shouldResolve) {
      const resolveCount = Math.min(Math.max(parseInt(query.resolve_count, 10) || 3, 1), 8);
      // Resuelve en paralelo los primeros resultados de cada sitio.
      const bySite = new Map();
      for (const result of results) {
        if (!bySite.has(result.site)) bySite.set(result.site, []);
        if (bySite.get(result.site).length < resolveCount) bySite.get(result.site).push(result);
      }
      const jobs = [];
      for (const [site, items] of bySite.entries()) {
        for (const item of items) {
          jobs.push(scrapers.resolveResult(site, item).then(resolved => {
            const magnet = resolved.find(r => r.magnet);
            if (magnet) {
              item.magnet = magnet.magnet;
              item.infoHash = magnet.infoHash;
              item.seeders = item.seeders || magnet.seeders;
              item.needsResolution = false;
            }
          }));
        }
      }
      await Promise.allSettled(jobs);
      hydrated = results;
    }

    const data = hydrated
      .map((result, index) => ({ rank: index + 1, ...result, extraText: undefined, spanish: undefined }))
      .slice(0, limit);

    return res.status(200).json({
      success: true,
      query: term,
      total: data.length,
      sites: scrapers.status(),
      results: data,
      errors
    });
  } catch (err) {
    console.error('Scraper search error:', err.message);
    return res.status(502).json({
      success: false,
      error: 'No se pudo completar la búsqueda en los sitios torrent.',
      detail: err.message
    });
  }
};
