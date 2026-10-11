/**
 * POST /api/admin/add
 * Inserta un registro en hydra_vault. Requiere x-admin-secret.
 */
const crypto = require('crypto');
const config = require('../../src/config');
const db = require('../../src/db');
const { normalizeEpisodeFields } = require('../../src/utils/episodes');

const ALLOWED_TYPES = new Set(['anime', 'series', 'movie', 'drama']);

function matchesSecret(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || !candidate || !expected) {
    return false;
  }
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return candidateBytes.length === expectedBytes.length && crypto.timingSafeEqual(candidateBytes, expectedBytes);
}

// Acepta el ID o la URL completa: imdb.com/title/tt123…, kitsu.app/anime/46474, anilist.co/anime/154587/…, themoviedb.org/tv/1234-nombre
function normalizeExternalId(value, field) {
  const text = optionalText(value, field, 300);
  if (!text) return null;
  if (field === 'imdb_id') {
    const match = text.match(/tt\d{5,}/i);
    if (!match) throw new Error('El campo "imdb_id" debe tener el formato tt1234567.');
    return match[0].toLowerCase();
  }
  if (field === 'custom_id') {
    if (text.length > 100) throw new Error('El campo "custom_id" supera 100 caracteres.');
    if (text.includes(':')) throw new Error('El campo "custom_id" no puede contener ":".');
    return text;
  }
  const urlMatch = text.match(/\/(?:anime|manga|tv|movie)\/(\d+)/i);
  const digits = urlMatch ? urlMatch[1] : text;
  if (!/^\d{1,20}$/.test(digits)) throw new Error(`El campo "${field}" debe ser numérico (o la URL de la ficha).`);
  return digits;
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
    if (!/^magnet:\?.*xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i.test(magnet) && !/^https?:\/\/\S+$/i.test(magnet) && !/^[a-f0-9]{40}$/i.test(magnet)) {
      return res.status(400).json({ success: false, error: 'El enlace debe ser un magnet (urn:btih), un hash de 40 caracteres o una URL http(s).' });
    }
    if (!type || !ALLOWED_TYPES.has(type.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'type debe ser anime, series, movie o drama.' });
    }

    const seeders = body.seeders === undefined || body.seeders === '' ? 10 : Number(body.seeders);
    if (!Number.isInteger(seeders) || seeders < 0 || seeders > 2147483647) {
      return res.status(400).json({ success: false, error: 'seeders debe ser un entero mayor o igual a cero.' });
    }

    // Película: sin temporada/episodio. Serie/drama: temporada + episodio. Anime: capítulo (temporada opcional).
    let episodeFields;
    try {
      episodeFields = normalizeEpisodeFields(type.toLowerCase(), body.season, body.episode, { strict: true });
    } catch (validationError) {
      return res.status(400).json({ success: false, error: validationError.message });
    }

    const entry = {
      imdb_id: normalizeExternalId(body.imdb_id, 'imdb_id'),
      tmdb_id: normalizeExternalId(body.tmdb_id, 'tmdb_id'),
      anilist_id: normalizeExternalId(body.anilist_id, 'anilist_id'),
      kitsu_id: normalizeExternalId(body.kitsu_id, 'kitsu_id'),
      custom_id: normalizeExternalId(body.custom_id, 'custom_id'),
      type: type.toLowerCase(),
      season: episodeFields.season,
      episode: episodeFields.episode,
      episode_title: episodeFields.episode === null ? null : optionalText(body.episode_title, 'episode_title', 300),
      source_platform: optionalText(body.source_platform, 'source_platform', 50) || 'Torrent',
      title,
      magnet,
      quality: optionalText(body.quality, 'quality', 20) || '1080p',
      audio_lang: optionalText(body.audio_lang, 'audio_lang', 50) || 'Multi',
      subtitles: optionalText(body.subtitles, 'subtitles', 50) || 'Multi',
      size: optionalText(body.size, 'size', 20) || 'N/D',
      seeders
    };

    const duplicate = await db.findDuplicate(entry);
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'Este enlace ya está guardado para ese mismo episodio.', data: duplicate });
    }

    const insertedRow = await db.createEntry(entry, { strictEpisodes: true });
    return res.status(201).json({
      success: true,
      message: 'Contenido insertado correctamente.',
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
