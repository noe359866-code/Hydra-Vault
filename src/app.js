const express = require('express');
const cors = require('cors');
const path = require('path');
const stremioRoutes = require('./routes/stremio');
const adminAddHandler = require('../api/admin/add');
const { initDb } = require('./db');

const app = express();

// Delay the database/schema check until a route actually needs the database.
// This keeps static pages and the Stremio manifest free from DB work on cold starts.
let dbInitialization = null;
function initializeDatabaseForRequest(req, res, next) {
  const needsDb = /^(?:\/stream\/|\/catalog\/|\/meta\/)/.test(req.path) || req.path === '/api/admin/add';

  if (!needsDb) return next();

  if (!dbInitialization) {
    dbInitialization = initDb().catch((err) => {
      dbInitialization = null;
      throw err;
    });
  }

  dbInitialization.then(() => next(), next);
}

// Universal CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'Range', 'X-Requested-With']
}));

// The API accepts small JSON payloads; keep parsing bounded.
app.use(express.json({ limit: '1mb' }));

// Static Assets
app.use(express.static(path.join(__dirname, '../public')));

// Initialize the database before every database-backed endpoint, including serverless-style handlers.
app.use(initializeDatabaseForRequest);

// Único endpoint de escritura: guardar contenido desde /admin (igual que la función serverless de Vercel).
app.all('/api/admin/add', adminAddHandler);

// Lightweight static pages (also rewritten directly to static files on Vercel).
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});
app.get('/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Stremio Addon Protocol Routes (/manifest.json, /stream/..., /catalog/..., /meta/...)
app.use('/', stremioRoutes);

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
