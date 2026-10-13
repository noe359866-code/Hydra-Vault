const express = require('express');
const cors = require('cors');
const path = require('path');
const stremioRoutes = require('./routes/stremio');
const adminAddHandler = require('../api/admin/add');
const adminListHandler = require('../api/admin/list');
const adminDeleteHandler = require('../api/admin/delete');
const scraperSearchHandler = require('../api/scrapers/search');
const scraperStatusHandler = require('../api/scrapers/status');
const adminImportHandler = require('../api/admin/import');

const app = express();

// Universal CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'Range', 'X-Requested-With']
}));

// The API accepts small JSON payloads; keep parsing bounded.
app.use(express.json({ limit: '1mb' }));

// Static Assets
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1h' }));

// Endpoints privados del panel /admin (igual que las funciones serverless de Vercel).
app.all('/api/admin/add', adminAddHandler);         // Guardar contenido
app.all('/api/admin/list', adminListHandler);       // Buscar/listar registros
app.all('/api/admin/delete', adminDeleteHandler);   // Eliminar registros seleccionados
app.all('/api/admin/import', adminImportHandler);   // Importar desde las webs torrent

// Buscador de webs torrent (lectura pública: consulta los sitios y devuelve resultados en español).
app.all('/api/scrapers/search', scraperSearchHandler);
app.all('/api/scrapers/status', scraperStatusHandler);

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
