/**
 * GET /api/scrapers/status
 * Estado de salud de cada sitio torrent (latencia y último error conocido).
 */
const scrapers = require('../../src/scrapers');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta GET.' });
  }

  return res.status(200).json({
    success: true,
    allowVose: scrapers.allowVose(),
    sites: scrapers.status()
  });
};
