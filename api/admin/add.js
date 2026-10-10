/**
 * POST /api/admin/add
 * Inserta un registro en hydra_vault. Requiere x-admin-secret.
 */
const crypto = require('crypto');
const config = require('../../src/config');
const { insertEntry } = require('../../lib/db');

const ALLOWED_TYPES = new Set(['anime', 'series', 'movie', 'drama']);

function matchesSecret(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || !candidate || !expected) {
    return false;
  }
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return candidateBytes.length === expectedBytes.length && crypto.timingSafeEqual(candidateBytes, expectedBytes);
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`El campo "${field}" debe ser texto.`);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new Error(`El campo "${field}" supera ${maxLength} caracteres.`);
  }
  return text;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido. Solo se acepta POST.' });
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

    const type = optionalText(body.type, 'type', 20);
    const title = optionalText(body.title, 'title', 1000);
    const magnet = optionalText(body.magnet, 'magnet', 10000);

    if (!title) return res.status(400).json({ success: false, error: 'El campo "title" es obligatorio.' });
    if (!magnet) return res.status(400).json({ success: false, error: 'El campo "magnet" es obligatorio.' });
    if (!type || !ALLOWED_TYPES.has(type.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'type debe ser anime, series, movie o drama.' });
    }

    const seeders = body.seeders === undefined || body.seeders === '' ? 10 : Number(body.seeders);
    if (!Number.isInteger(seeders) || seeders < 0 || seeders > 2147483647) {
      return res.status(400).json({ success: false, error: 'seeders debe ser un entero mayor o igual a cero.' });
    }

    const entry = {
      imdb_id: optionalText(body.imdb_id, 'imdb_id', 50),
      tmdb_id: optionalText(body.tmdb_id, 'tmdb_id', 50),
      anilist_id: optionalText(body.anilist_id, 'anilist_id', 50),
      kitsu_id: optionalText(body.kitsu_id, 'kitsu_id', 50),
      custom_id: optionalText(body.custom_id, 'custom_id', 100),
      type: type.toLowerCase(),
      source_platform: optionalText(body.source_platform, 'source_platform', 50) || 'Torrent',
      title,
      magnet,
      quality: optionalText(body.quality, 'quality', 20) || '1080p',
      audio_lang: optionalText(body.audio_lang, 'audio_lang', 50) || 'Multi',
      subtitles: optionalText(body.subtitles, 'subtitles', 50) || 'Multi',
      size: optionalText(body.size, 'size', 20) || 'N/D',
      seeders
    };

    const insertedRow = await insertEntry(entry);
    return res.status(201).json({
      success: true,
      message: 'Contenido insertado correctamente en Layerbase PostgreSQL.',
      data: insertedRow
    });
  } catch (error) {
    if (error instanceof Error && /^El campo /.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Error en POST /api/admin/add:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo guardar el registro en la base de datos.' });
  }
};
