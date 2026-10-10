const db = require('../db');
const { formatStremioStream } = require('../utils/magnet');

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

    if (!rows || rows.length === 0) {
      return res.json({ streams: [] });
    }

    const streams = rows.map(formatStremioStream);

    return res.json({ streams });
  } catch (err) {
    console.error(`Error resolving streams for type=${type}, id=${cleanId}:`, err.message);
    return res.json({ streams: [] });
  }
}

module.exports = {
  handleStreamRequest
};
