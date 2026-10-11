require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production' || process.env.VERCEL === '1';

const config = {
  port: parseInt(process.env.PORT || '7000', 10),
  nodeEnv,
  
  // Layerbase PostgreSQL connection URL
  databaseUrl: process.env.LAYERBASE_DATABASE_URL || '',
  
  // Prowlarr auto-fill (búsqueda bajo demanda cuando Stremio pide algo que no está en la BD)
  prowlarr: {
    // Si defines la API key sin URL, se asume Prowlarr local en http://localhost:9696
    url: (process.env.PROWLARR_URL || ((process.env.PROWLARR_API_KEY || '').trim() ? 'http://localhost:9696' : '')).trim().replace(/\/+$/, ''),
    apiKey: (process.env.PROWLARR_API_KEY || '').trim(),
    // Máximo de ms que /stream espera una búsqueda antes de responder (la búsqueda sigue en background)
    timeoutMs: parseInt(process.env.PROWLARR_TIMEOUT_MS || '8000', 10),
    // Margen extra de red para la búsqueda en background tras el timeout de respuesta
    graceMs: parseInt(process.env.PROWLARR_GRACE_MS || '8000', 10),
    // Ignorar resultados con menos seeders de los indicados
    minSeeders: parseInt(process.env.PROWLARR_MIN_SEEDERS || '0', 10),
    // Máximo de resultados Prowlarr aceptados por búsqueda
    maxResults: parseInt(process.env.PROWLARR_MAX_RESULTS || '12', 10)
  },
  
  // Admin Secret for API and Admin Panel authentication
  // Never allow the development fallback to protect production endpoints.
  adminSecret: process.env.ADMIN_SECRET || (isProduction ? '' : 'hydra-dev-secret-2026'),
  hasCustomSecret: Boolean(process.env.ADMIN_SECRET),
  
  // Stremio Addon Configuration
  addon: {
    id: 'community.hydra.torrents',
    version: '1.1.0',
    name: 'Hydra Torrents',
    description: 'Contenido exclusivo, rarezas, animes y dramas asiáticos (Viki, iQiyi, Europa, América) curados a mano.',
    logo: '/favicon.svg',
    contactEmail: 'contact@hydratorrents.com',
  }
};

module.exports = config;
