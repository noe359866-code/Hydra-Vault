const db = require('../db');
const { formatStremioStream } = require('../utils/magnet');

/**
 * Handles GET /stream/:type/:id.json requests
 */
async function handleStreamRequest(req, res) {
  const { type, id } = req.params;
  
  // Clean id by stripping .json if present in the param
  const cleanId = id.replace(/\.json$/, '');
  
  try {
    const rows = await db.findStreamsForStremio({ type, id: cleanId });

    if (!rows || rows.length === 0) {
      return res.json({ streams: [] });
    }

    const streams = rows.map(formatStremioStream);

    // Stremio caching headers
    res.setHeader('Cache-Control', 'max-age=1800, stale-while-revalidate=3600');
    return res.json({ streams });
  } catch (err) {
    console.error(`Error resolving streams for type=${type}, id=${cleanId}:`, err.message);
    return res.json({ streams: [] });
  }
}

module.exports = {
  handleStreamRequest
};
