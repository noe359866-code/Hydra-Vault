const db = require('../db');
const { formatStremioStream } = require('../utils/magnet');
const { streamsFromScrapers, enabled: scrapersEnabled } = require('../scrapers/streams');

/**
 * Handles GET /stream/:type/:id.json requests
 */
async function handleStreamRequest(req, res) {
  const { type, id } = req.params;
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  
  // Clean id by stripping .json if present in the param
  const cleanId = id.replace(/\.json$/, '');
  
  try {
    const rows = await db.findStreamsForStremio({ type, id: cleanId });

    let streams = (rows || []).map(formatStremioStream);

    // Refuerzo con las webs torrent en español (búsqueda en vivo) cuando la
    // bóveda no cubre el título o se pide un episodio sin versión propia.
    if (scrapersEnabled()) {
      const shouldScrape =
        streams.length === 0 ||
        /\d+:\d+$/.test(cleanId) || // petición de episodio concreto
        cleanId.startsWith('hydra:scrap-');
      if (shouldScrape) {
        try {
          const scraped = await streamsFromScrapers({ type, id: cleanId, dbRows: rows || [] });
          if (scraped.length) {
            const seen = new Set(streams.map(stream => stream.infoHash || stream.url || stream.externalUrl));
            for (const stream of scraped) {
              const key = stream.infoHash || stream.url || stream.externalUrl;
              if (key && !seen.has(key)) {
                seen.add(key);
                streams.push(stream);
              }
            }
          }
        } catch (err) {
          console.error(`Scraper streams fallback failed for ${cleanId}:`, err.message);
        }
      }
    }

    if (!streams.length) {
      return res.json({ streams: [] });
    }

    return res.json({ streams });
  } catch (err) {
    console.error(`Error resolving streams for type=${type}, id=${cleanId}:`, err.message);
    return res.json({ streams: [] });
  }
}

module.exports = {
  handleStreamRequest
};
