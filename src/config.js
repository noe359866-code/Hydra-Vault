require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production' || process.env.VERCEL === '1';

const config = {
  port: parseInt(process.env.PORT || '7000', 10),
  nodeEnv,
  databaseUrl: process.env.LAYERBASE_DATABASE_URL || '',
  adminSecret: process.env.ADMIN_SECRET || (isProduction ? '' : 'hydra-dev-secret-2026'),
  hasCustomSecret: Boolean(process.env.ADMIN_SECRET),
  jackett: {
    // Public HTTPS hostname protected by Cloudflare Access; never expose Jackett openly.
    url: process.env.JACKETT_URL || '',
    apiKey: process.env.JACKETT_API_KEY || '',
    accessClientId: process.env.JACKETT_ACCESS_CLIENT_ID || '',
    accessClientSecret: process.env.JACKETT_ACCESS_CLIENT_SECRET || ''
  },
  addon: {
    id: 'community.hydra.torrents',
    version: '1.0.0',
    name: 'Hydra Torrents',
    description: 'Contenido curado y resultados de torrents indexados mediante Jackett.',
    logo: '/favicon.svg',
    contactEmail: 'contact@hydratorrents.com'
  }
};

module.exports = config;
