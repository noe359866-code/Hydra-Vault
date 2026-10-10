require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '7000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Layerbase PostgreSQL connection URL
  databaseUrl: process.env.LAYERBASE_DATABASE_URL || '',
  
  // Admin Secret for API and Admin Panel authentication
  adminSecret: process.env.ADMIN_SECRET || 'hydra-dev-secret-2026',
  hasCustomSecret: Boolean(process.env.ADMIN_SECRET),
  
  // Stremio Addon Configuration
  addon: {
    id: 'community.hydra.torrents',
    version: '1.0.0',
    name: 'Hydra Torrents',
    description: 'Contenido exclusivo, rarezas, animes y dramas asiáticos (Viki, iQiyi, Europa, América) curados a mano.',
    logo: '/favicon.svg',
    contactEmail: 'contact@hydratorrents.com',
  }
};

module.exports = config;
