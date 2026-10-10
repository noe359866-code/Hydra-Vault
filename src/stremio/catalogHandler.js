const db = require('../db');

/**
 * Generates an elegant SVG poster data URI if no external poster URL is available
 */
function createFallbackPoster(title, platform, quality) {
  const cleanTitle = (title || 'Hydra Content').substring(0, 30);
  const color = platform === 'Viki' ? '#8b5cf6' : (platform === 'iQiyi' ? '#10b981' : '#3b82f6');
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
    </defs>
    <rect width="300" height="450" rx="12" fill="url(#bg)"/>
    <circle cx="150" cy="140" r="50" fill="${color}" fill-opacity="0.2"/>
    <text x="150" y="148" font-family="system-ui, sans-serif" font-weight="bold" font-size="28" fill="${color}" text-anchor="middle">HYDRA</text>
    <rect x="20" y="240" width="260" height="1" fill="#334155" />
    <text x="150" y="280" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#f8fafc" text-anchor="middle">${escapeXml(cleanTitle)}</text>
    <rect x="100" y="320" width="100" height="28" rx="6" fill="${color}" />
    <text x="150" y="339" font-family="system-ui, sans-serif" font-weight="bold" font-size="12" fill="#ffffff" text-anchor="middle">${escapeXml(platform || 'Vault')} • ${escapeXml(quality || '1080p')}</text>
  </svg>`;
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

/**
 * Handles GET /catalog/:type/:id.json and GET /catalog/:type/:id/:extra.json
 */
async function handleCatalogRequest(req, res) {
  const { type, id } = req.params;
  const cleanCatalogId = id.replace(/\.json$/, '');

  let genre = req.query.genre || null;
  let search = req.query.search || null;
  let skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;

  if (req.params.extra) {
    const extraStr = req.params.extra.replace(/\.json$/, '');
    const searchParams = new URLSearchParams(extraStr);
    if (searchParams.get('genre')) genre = searchParams.get('genre');
    if (searchParams.get('search')) search = searchParams.get('search');
    if (searchParams.get('skip')) skip = parseInt(searchParams.get('skip'), 10) || 0;
  }

  try {
    const rows = await db.getCatalogItems({
      catalogId: cleanCatalogId,
      type,
      genre,
      search,
      skip,
      limit: 50
    });

    const metas = rows.map(item => {
      // Prefer IMDb ID for Cinemeta metadata resolution in Stremio
      const metaId = item.imdb_id || (item.kitsu_id ? `kitsu:${item.kitsu_id}` : null) || item.custom_id || `hydra:${item.id}`;
      
      let stremioType = item.type;
      if (stremioType === 'drama') stremioType = 'series';

      const genres = [];
      if (item.source_platform) genres.push(item.source_platform);
      if (item.audio_lang) genres.push(item.audio_lang);
      if (item.quality) genres.push(item.quality);

      return {
        id: metaId,
        type: stremioType,
        name: item.title,
        genres,
        poster: createFallbackPoster(item.title, item.source_platform, item.quality),
        posterShape: 'regular',
        description: `Hydra Curated Vault • ${item.source_platform} • Calidad: ${item.quality} • Audio: ${item.audio_lang} • Seeds: ${item.seeders}`
      };
    });

    res.setHeader('Cache-Control', 'max-age=1800, stale-while-revalidate=3600');
    return res.json({ metas });
  } catch (err) {
    console.error('Error handling catalog request:', err.message);
    return res.json({ metas: [] });
  }
}

module.exports = {
  handleCatalogRequest
};
