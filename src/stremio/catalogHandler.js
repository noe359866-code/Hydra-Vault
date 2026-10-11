const db = require('../db');
const { cleanShowName, posterFor } = require('../utils/titles');

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

/**
 * GET /catalog/:type/:id.json y GET /catalog/:type/:id/:extra.json
 * Un elemento por título (todas sus temporadas/episodios agrupados).
 */
async function handleCatalogRequest(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  const { type, id } = req.params;
  const catalogId = id.replace(/\.json$/, '');
  const { genre, search, skip } = parseExtra(req);

  try {
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
