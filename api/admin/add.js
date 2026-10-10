/**
 * POST /api/admin/add
 * Endpoint Privado Protegido para Administrador
 * Requiere cabecera x-admin-secret coincidente con process.env.ADMIN_SECRET
 */

const { insertEntry } = require('../../lib/db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Solo se acepta POST.'
    });
  }

  // Authentication check via x-admin-secret header
  const secretHeader = req.headers['x-admin-secret'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
  const expectedSecret = process.env.ADMIN_SECRET || 'hydra-dev-secret-2026';

  if (!secretHeader || secretHeader.trim() !== expectedSecret.trim()) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Cabecera x-admin-secret inválida o no suministrada.'
    });
  }

  try {
    const {
      imdb_id,
      tmdb_id,
      anilist_id,
      kitsu_id,
      custom_id,
      type,
      source_platform,
      title,
      magnet,
      quality,
      audio_lang,
      size,
      seeders
    } = req.body || {};

    // Basic Validation
    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        error: 'El campo "title" es obligatorio.'
      });
    }

    if (!magnet || !String(magnet).trim()) {
      return res.status(400).json({
        success: false,
        error: 'El campo "magnet" es obligatorio (debe ser un enlace Magnet o URL).'
      });
    }

    if (!type || !String(type).trim()) {
      return res.status(400).json({
        success: false,
        error: 'El campo "type" es obligatorio (valores: anime, series, movie, drama).'
      });
    }

    // Execute INSERT in Layerbase PostgreSQL
    const insertedRow = await insertEntry({
      imdb_id,
      tmdb_id,
      anilist_id,
      kitsu_id,
      custom_id,
      type: String(type).trim().toLowerCase(),
      source_platform: source_platform || 'Torrent',
      title: String(title).trim(),
      magnet: String(magnet).trim(),
      quality: quality || '1080p',
      audio_lang: audio_lang || 'Multi',
      size: size || 'N/D',
      seeders: seeders !== undefined ? parseInt(seeders, 10) : 10
    });

    return res.status(201).json({
      success: true,
      message: 'Contenido insertado exitosamente en Layerbase PostgreSQL.',
      data: insertedRow
    });
  } catch (err) {
    console.error('Error en POST /api/admin/add:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno al insertar registro en Layerbase PostgreSQL: ' + err.message
    });
  }
};
