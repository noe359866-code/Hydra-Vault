const db = require('../db');
const config = require('../config');
const { formatStremioStream } = require('../utils/magnet');
const { searchJackett } = require('./jackett');

/**
 * Handles GET /stream/:type/:id.json requests.
 * Local curated entries remain first; Jackett supplements missing releases.
 */
async function handleStreamRequest(req, res) {
  const { type } = req.params;
  const cleanId = req.params.id.replace(/\.json$/, '');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');

  try {
    const idParts = cleanId.split(':');
    const baseId = idParts[0];
    const season = idParts.length >= 2 && /^\d+$/.test(idParts[1]) ? Number(idParts[1]) : null;
    const episode = idParts.length >= 3 && /^\d+$/.test(idParts[2]) ? Number(idParts[2]) : null;
    const rows = await db.findStreamsForStremio({ type, id: cleanId });
    const streams = (rows || []).map(formatStremioStream);
    const enabled = Boolean(config.jackett.url && config.jackett.apiKey);

    if (enabled) {
      const external = await searchJackett({
        id: baseId,
        type,
        season,
        episode,
        title: req.query?.search || undefined
      });
      const seen = new Set(streams.map(s => s.infoHash).filter(Boolean));
      for (const item of external) {
        const formatted = formatStremioStream({
          title: item.title,
          magnet: item.magnet || (item.infoHash ? 'magnet:?xt=urn:btih:' + item.infoHash : ''),
          quality: item.quality,
          source_platform: item.source_platform,
          audio_lang: item.audio_lang,
          subtitles: item.subtitles,
          size: item.sizeLabel,
          seeders: item.seeders
        });
        const key = formatted.infoHash || formatted.url || formatted.externalUrl;
        if (key && !seen.has(key)) {
          streams.push(formatted);
          seen.add(key);
        }
      }
    }

    return res.json({ streams: streams.slice(0, 30) });
  } catch (err) {
    console.error('Error resolving streams for type=' + type + ', id=' + cleanId + ':', err.message);
    return res.json({ streams: [] });
  }
}

module.exports = { handleStreamRequest };
