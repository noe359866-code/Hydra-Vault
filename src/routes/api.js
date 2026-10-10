const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth, verifySecret, extractToken } = require('../middleware/auth');
const { parseMagnet, formatStremioStream } = require('../utils/magnet');

/**
 * Health check & database connection status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await db.checkHealth();
    res.json({
      ...health,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

/**
 * Authenticate / verify token
 */
router.post('/auth/verify', (req, res) => {
  const token = req.body.token || extractToken(req);
  if (!token) {
    return res.status(400).json({ valid: false, message: 'Token no suministrado.' });
  }

  const isValid = verifySecret(token);
  return res.json({
    valid: isValid,
    message: isValid ? 'Token verificado exitosamente.' : 'Token inválido.'
  });
});

/**
 * Global Vault Statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List Vault Entries (Paginated & Filterable)
 */
router.get('/vault', async (req, res) => {
  try {
    const { type, platform, search, page, limit, sort } = req.query;
    const result = await db.getEntries({
      type,
      platform,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      sort
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Single Entry by ID
 */
router.get('/vault/:id', async (req, res) => {
  try {
    const entry = await db.getEntryById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Entrada no encontrada.' });
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create New Entry (Protected by ADMIN_SECRET)
 */
router.post('/vault', requireAdminAuth, async (req, res) => {
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
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'El campo "title" es obligatorio.' });
    }
    if (!magnet || !magnet.trim()) {
      return res.status(400).json({ error: 'El campo "magnet" es obligatorio.' });
    }
    if (!type || !type.trim()) {
      return res.status(400).json({ error: 'El campo "type" es obligatorio (anime, series, movie, drama).' });
    }

    const created = await db.createEntry({
      imdb_id,
      tmdb_id,
      anilist_id,
      kitsu_id,
      custom_id,
      type,
      source_platform: source_platform || 'Torrent',
      title,
      magnet,
      quality: quality || '1080p',
      audio_lang: audio_lang || 'Multi',
      size: size || 'N/D',
      seeders: seeders !== undefined ? parseInt(seeders, 10) : 10
    });

    res.status(201).json({
      message: 'Entrada creada exitosamente en Hydra Vault.',
      data: created
    });
  } catch (err) {
    console.error('Error in POST /api/vault:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update Existing Entry (Protected by ADMIN_SECRET)
 */
router.put('/vault/:id', requireAdminAuth, async (req, res) => {
  try {
    const updated = await db.updateEntry(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Entrada no encontrada para actualizar.' });
    }
    res.json({
      message: 'Entrada actualizada exitosamente.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete Entry (Protected by ADMIN_SECRET)
 */
router.delete('/vault/:id', requireAdminAuth, async (req, res) => {
  try {
    const deleted = await db.deleteEntry(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Entrada no encontrada para eliminar.' });
    }
    res.json({ message: 'Entrada eliminada exitosamente.', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bulk Import Entries (Protected by ADMIN_SECRET)
 */
router.post('/vault/bulk', requireAdminAuth, async (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : req.body.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Se esperaba un arreglo de entradas JSON.' });
    }

    const result = await db.bulkInsert(entries);
    res.status(201).json({
      message: `Procesamiento masivo completado. ${result.inserted} elementos insertados.`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Seed Curated Sample Data (Protected by ADMIN_SECRET)
 */
router.post('/vault/seed', requireAdminAuth, async (req, res) => {
  try {
    const result = await db.seedData();
    res.json({
      message: `Datos curados insertados exitosamente (${result.inserted} títulos).`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Magnet Inspector Utility
 */
router.post('/vault/parse-magnet', (req, res) => {
  const { magnet } = req.body;
  if (!magnet) {
    return res.status(400).json({ error: 'URL o Magnet requerido.' });
  }

  const parsed = parseMagnet(magnet);
  
  // Intelligent quality and language heuristic based on title/dn
  let suggestedQuality = '1080p';
  let suggestedAudio = 'Multi';
  const text = (parsed.dn || magnet).toLowerCase();

  if (text.includes('2160p') || text.includes('4k') || text.includes('uhd')) {
    suggestedQuality = '4K';
  } else if (text.includes('720p')) {
    suggestedQuality = '720p';
  }

  if (text.includes('latino') || text.includes('lat')) {
    suggestedAudio = 'Latino';
  } else if (text.includes('sub español') || text.includes('sub esp') || text.includes('spanish sub')) {
    suggestedAudio = 'Sub Español';
  } else if (text.includes('jap') || text.includes('japanese')) {
    suggestedAudio = 'Jap/Sub';
  }

  res.json({
    parsed,
    suggestions: {
      title: parsed.dn || '',
      quality: suggestedQuality,
      audio_lang: suggestedAudio,
      size: parsed.suggestedSize || 'N/D'
    }
  });
});

/**
 * Live Stremio Stream Tester Utility
 */
router.get('/stremio/test', async (req, res) => {
  const { type = 'series', id = 'tt21344706' } = req.query;
  try {
    const rows = await db.findStreamsForStremio({ type, id });
    const formatted = rows.map(formatStremioStream);
    res.json({
      requested: { type, id },
      foundRows: rows.length,
      stremioResponse: { streams: formatted },
      rawDbRows: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
