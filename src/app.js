const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const stremioRoutes = require('./routes/stremio');
const apiRoutes = require('./routes/api');
const { renderLandingPage } = require('./views/landingView');
const { renderAdminPage } = require('./views/adminView');
const { initDb } = require('./db');

const app = express();

// Initialize DB schema & connection check asynchronously
initDb().catch(err => {
  console.warn('Initial DB check notice:', err.message);
});

// Stremio-compliant CORS configuration
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

// Helper to construct base and manifest URL
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${config.port}`;
  return `${protocol}://${host}`;
}

// 1. Stremio Addon Protocol Routes
app.use('/', stremioRoutes);

// 2. Admin & CRUD REST API
app.use('/api', apiRoutes);

// 3. Admin Panel Web View
app.get('/admin', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const manifestUrl = `${baseUrl}/manifest.json`;
  const html = renderAdminPage({
    manifestUrl,
    defaultSecret: config.adminSecret,
    isDefaultSecret: !config.hasCustomSecret
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 4. Public Landing Page / Configuration Page
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
