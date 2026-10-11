/**
 * POST /api/admin/delete
 * Elimina uno o varios registros de hydra_vault por id. Requiere cabecera x-admin-secret.
 * Cuerpo JSON: { "ids": [1, 2, 3] } o { "id": 1 } (máximo 100 ids por petición).
 * Devuelve cuántos registros se eliminaron y cuáles eran.
 */
const config = require('../../src/config');
const db = require('../../src/db');
const { matchesSecret } = require('../../src/utils/adminAuth');

const MAX_IDS_PER_REQUEST = 100;

function parseIds(body) {
  const raw = Array.isArray(body.ids) ? body.ids : (body.id === undefined || body.id === null ? null : [body.id]);
  if (!raw) return { error: 'Envía "ids" (lista de identificadores) o "id" para eliminar.' };
  if (raw.length === 0) return { error: 'La lista "ids" no puede estar vacía.' };
  if (raw.length > MAX_IDS_PER_REQUEST) {
    return { error: `No se pueden eliminar más de ${MAX_IDS_PER_REQUEST} registros a la vez.` };
  }
  const ids = [];
  for (const value of raw) {
    const id = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
    if (!Number.isInteger(id) || id <= 0 || String(value).trim() === '') {
      return { error: 'Cada id debe ser un número entero positivo.' };
    }
    ids.push(id);
  }
  return { ids: [...new Set(ids)] };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta POST o DELETE.' });
  }

  const expectedSecret = config.adminSecret;
  if (!expectedSecret) {
    return res.status(503).json({ success: false, error: 'ADMIN_SECRET no está configurado en el servidor.' });
  }
  if (!matchesSecret(req.headers['x-admin-secret'], expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: x-admin-secret incorrecto o ausente.' });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, error: 'El cuerpo debe ser un objeto JSON.' });
    }

    const parsed = parseIds(body);
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });

    const { deleted, ids } = await db.deleteEntries(parsed.ids);
    return res.status(200).json({
      success: true,
      message: deleted === 1 ? '1 registro eliminado.' : `${deleted} registros eliminados.`,
      requested: parsed.ids.length,
      deleted,
      ids
    });
  } catch (error) {
    console.error('Error en POST /api/admin/delete:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudieron eliminar los registros de la base de datos.' });
  }
};
