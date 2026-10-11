/**
 * GET /api/admin/list
 * Lista los registros de hydra_vault para gestionarlos desde /admin (buscar, seleccionar, eliminar).
 * Requiere cabecera x-admin-secret.
 * Query: search (texto libre), type (anime|series|movie|drama), page (>= 1), limit (1-100).
 */
const config = require('../../src/config');
const db = require('../../src/db');
const { matchesSecret } = require('../../src/utils/adminAuth');

const ALLOWED_TYPES = new Set(['anime', 'series', 'movie', 'drama']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta GET.' });
  }

  const expectedSecret = config.adminSecret;
  if (!expectedSecret) {
    return res.status(503).json({ success: false, error: 'ADMIN_SECRET no está configurado en el servidor.' });
  }
  if (!matchesSecret(req.headers['x-admin-secret'], expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: x-admin-secret incorrecto o ausente.' });
  }

  try {
    const query = req.query || {};
    const search = typeof query.search === 'string' ? query.search : '';
    const rawType = typeof query.type === 'string' ? query.type.trim().toLowerCase() : '';
    if (rawType && !ALLOWED_TYPES.has(rawType)) {
      return res.status(400).json({ success: false, error: 'type debe ser anime, series, movie o drama.' });
    }

    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);

    const { rows, total } = await db.listEntries({
      search,
      type: rawType,
      skip: (page - 1) * limit,
      limit
    });

    return res.status(200).json({
      success: true,
      data: {
        items: rows,
        total,
        page,
        pages: Math.max(Math.ceil(total / limit), 1),
        limit
      }
    });
  } catch (error) {
    console.error('Error en GET /api/admin/list:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo leer la base de datos.' });
  }
};
