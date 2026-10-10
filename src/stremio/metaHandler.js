const db = require('../db');

/**
 * Handles GET /meta/:type/:id.json requests
 */
async function handleMetaRequest(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  const { type, id } = req.params;
  const cleanId = id.replace(/\.json$/, '');

  try {
    const rows = await db.findStreamsForStremio({ type, id: cleanId });

    if (!rows || rows.length === 0) {
      return res.json({ meta: null });
    }

    const item = rows[0];
    let stremioType = item.type;
    if (stremioType === 'drama') stremioType = 'series';

    const genres = [item.source_platform, item.quality, item.audio_lang, item.subtitles].filter(Boolean);

    const meta = {
      id: cleanId,
      type: stremioType,
      name: item.title,
      genres,
      posterShape: 'regular',
      background: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop',
      description: `[Hydra Vault] Contenido curado exclusivo.\nPlataforma: ${item.source_platform}\nCalidad: ${item.quality}\nAudio: ${item.audio_lang}\nSubtítulos: ${item.subtitles || 'Multi'}\nTamaño: ${item.size}\nSeeders: ${item.seeders}`,
      releaseInfo: new Date(item.created_at || Date.now()).getFullYear().toString()
    };

    // Expose actual episode metadata when the vault stores individual episodes.
    if (stremioType === 'series') {
      const episodes = rows
        .filter(row => Number.isInteger(Number(row.season)) && Number(row.season) >= 0 && Number.isInteger(Number(row.episode)) && Number(row.episode) >= 1)
        .map(row => ({
          id: `${cleanId}:${Number(row.season)}:${Number(row.episode)}`,
          title: row.episode_title || row.title,
          season: Number(row.season),
          episode: Number(row.episode),
          released: row.created_at || new Date().toISOString()
        }));
      meta.videos = episodes.length ? episodes : [{
        id: `${cleanId}:1:1`, title: item.title, season: 1, episode: 1,
        released: item.created_at || new Date().toISOString()
      }];
    }

    return res.json({ meta });
  } catch (err) {
    console.error('Error handling meta request:', err.message);
    return res.json({ meta: null });
  }
}

module.exports = {
  handleMetaRequest
};
