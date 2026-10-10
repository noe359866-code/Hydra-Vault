const express = require('express');
const router = express.Router();
const { getManifest } = require('../stremio/manifest');
const { handleStreamRequest } = require('../stremio/streamHandler');
const { handleCatalogRequest } = require('../stremio/catalogHandler');
const { handleMetaRequest } = require('../stremio/metaHandler');

// Manifest Endpoint
router.get('/manifest.json', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:7000';
  const baseUrl = `${protocol}://${host}`;

  res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=7200');
  res.json(getManifest(baseUrl));
});

// Stream Endpoint
router.get('/stream/:type/:id', handleStreamRequest);

// Catalog Endpoints (standard and with extra parameters)
router.get('/catalog/:type/:id', handleCatalogRequest);
router.get('/catalog/:type/:id/:extra', handleCatalogRequest);

// Meta Endpoint
router.get('/meta/:type/:id', handleMetaRequest);

module.exports = router;
