const config = require('../config');

function getManifest(baseUrl = '') {
  const logoUrl = baseUrl ? `${baseUrl}/favicon.svg` : '/favicon.svg';

  return {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    logo: logoUrl,
    background: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series', 'anime', 'drama', 'other'],
        idPrefixes: ['tt', 'kitsu', 'anilist', 'tmdb', 'hydra']
      },
      {
        name: 'catalog',
        types: ['series', 'movie', 'anime'],
        idPrefixes: ['tt', 'kitsu', 'anilist', 'tmdb', 'hydra']
      },
      {
        name: 'meta',
        types: ['series', 'movie', 'anime', 'drama', 'other'],
        idPrefixes: ['tt', 'kitsu', 'anilist', 'tmdb', 'hydra']
      }
    ],
    types: ['movie', 'series', 'anime', 'drama', 'other'],
    idPrefixes: ['tt', 'kitsu', 'anilist', 'tmdb', 'hydra'],
    catalogs: [
      {
        id: 'hydra_dramas',
        type: 'series',
        name: 'Hydra Asian Dramas (Viki & iQiyi)',
        extra: [
          { name: 'genre', isRequired: false, options: ['All', 'Viki', 'iQiyi', 'Latino', 'Sub Español'] },
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        id: 'hydra_anime',
        type: 'anime',
        name: 'Hydra Anime Vault',
        extra: [
          { name: 'genre', isRequired: false, options: ['All', 'Latino', 'Jap/Sub', 'Multi'] },
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        id: 'hydra_movies',
        type: 'movie',
        name: 'Hydra Rare Movies & Exclusives',
        extra: [
          { name: 'genre', isRequired: false, options: ['All', '4K', '1080p', 'Europa', 'América'] },
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        id: 'hydra_series',
        type: 'series',
        name: 'Hydra Curated Series',
        extra: [
          { name: 'genre', isRequired: false, options: ['All', 'Viki', 'iQiyi', 'Europa', 'América'] },
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      }
    ],
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

module.exports = {
  getManifest
};
