/**
 * GET /api/vault
 * Endpoint Público para Cloudflare Worker (Hydra Torrents)
 * Consulta streams curados por múltiples IDs (IMDb, TMDb, AniList, Kitsu, Custom o PK)
 */

const { findStreamsById } = require('../lib/db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Solo se acepta GET.'
    });
  }

  try {
    const id = req.query.id;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro de consulta "id" es requerido. Ejemplo: /api/vault?id=tt21344706 o /api/vault?id=21'
      });
    }

    const rows = await findStreamsById(id.trim());

    // Format streams according to specification
    const streams = rows.map(row => {
      const source = row.source_platform || 'Torrent';
      const quality = row.quality || '1080p';
      const audio = row.audio_lang || 'Multi';
      const size = row.size || 'N/D';

      return {
        title: `[Hydra Vault ⚡] [${source}] ${quality} | ${audio}\n${row.title}`,
        url: row.magnet,
        details: {
          quality,
          size,
          source,
          seeders: row.seeders !== null && row.seeders !== undefined ? row.seeders : 10,
          audio
        }
      };
    });

    // Caching header for performance and CDN
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    
    return res.status(200).json({
      success: true,
      streams
    });
  } catch (err) {
    console.error('Error en GET /api/vault:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al consultar Layerbase PostgreSQL.'
    });
  }
};
