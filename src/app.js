const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const stremioRoutes = require('./routes/stremio');
const apiRoutes = require('./routes/api');
const vaultHandler = require('../api/vault');
const adminAddHandler = require('../api/admin/add');
const { renderLandingPage } = require('./views/landingView');
const { initDb } = require('./db');

const app = express();

// Initialize DB schema & connection check asynchronously
initDb().catch(err => {
  console.warn('Initial DB check notice:', err.message);
});

// Universal CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'Range', 'X-Requested-With']
}));

// Body Parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static Assets
app.use(express.static(path.join(__dirname, '../public')));

// Specific Endpoints for Cloudflare Worker & Admin API (matching Vercel serverless files)
app.all('/api/vault', vaultHandler);
app.all('/api/admin/add', adminAddHandler);

// Admin Web UI (Tailwind CSS SPA)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Stremio Addon Protocol Routes (/manifest.json, /stream/..., /catalog/..., /meta/...)
app.use('/', stremioRoutes);

// Admin & CRUD REST API
app.use('/api', apiRoutes);

// Helper to construct base and manifest URL
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${config.port}`;
  return `${protocol}://${host}`;
}

// Public Landing Page / Configuration Page
app.get(['/', '/configure'], (req, res) => {
  const baseUrl = getBaseUrl(req);
  const manifestUrl = `${baseUrl}/manifest.json`;
  const html = renderLandingPage({
    manifestUrl,
    addonName: config.addon.name,
    version: config.addon.version,
    description: config.addon.description
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 404 Fallback for unknown routes
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).redirect('/');
  }
  res.status(404).json({
    error: 'Not Found',
    message: `Ruta desconocida: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Error interno del servidor Hydra.'
  });
});

module.exports = app;
