const db = require('../db');
const { isEpisodicType, parseStremioId } = require('../utils/episodes');

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

    // Lista real de temporadas / episodios / capítulos guardados.
    if (isEpisodicType(item.type) || stremioType === 'series') {
      const parsedId = parseStremioId(cleanId);
      // Kitsu/AniList identifican cada temporada por separado: Stremio pide kitsu:ID:CAPÍTULO.
      const usesAbsoluteEpisodes = ['kitsu', 'anilist', 'mal'].includes(parsedId.prefix);
      const fallbackDate = item.created_at || new Date().toISOString();
      const seen = new Set();
      const videos = [];

      for (const row of rows) {
        if (row.episode === null || row.episode === undefined) continue;
        const episode = Number(row.episode);
        const season = row.season === null || row.season === undefined ? 1 : Number(row.season);
        if (!Number.isInteger(episode) || episode < 1 || !Number.isInteger(season) || season < 0) continue;

        const videoId = usesAbsoluteEpisodes ? `${cleanId}:${episode}` : `${cleanId}:${season}:${episode}`;
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        const isAnime = row.type === 'anime';
        videos.push({
          id: videoId,
          title: row.episode_title || (isAnime ? `Capítulo ${episode}` : `Episodio ${episode}`),
          season,
          episode,
          released: new Date(row.created_at || fallbackDate).toISOString()
        });
      }

      videos.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

      if (!videos.length) {
        // Solo hay packs completos: un único vídeo que devuelve el pack.
        const packSeason = rows.find(row => row.season !== null && row.season !== undefined);
        const season = packSeason ? Number(packSeason.season) : 1;
        videos.push({
          id: usesAbsoluteEpisodes ? `${cleanId}:1` : `${cleanId}:${season}:1`,
          title: item.title,
          season,
          episode: 1,
          released: new Date(fallbackDate).toISOString()
        });
      }

      meta.videos = videos;
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
