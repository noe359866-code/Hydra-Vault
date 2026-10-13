/**
 * Scraper de Pelispanda (pelispanda.org) — WordPress con tema React + REST API.
 *
 * - Búsqueda: GET /wp-json/wpreact/v1/search?query=…  → JSON con title/slug/type/language/tmdb_id.
 * - Detalle:  GET /wp-json/wpreact/v1/{movie|serie|anime}/<slug> → JSON con `downloads[]`
 *             que incluye magnets DIRECTOS (download_type "link").
 * - Solo entrega contenido latino/castellano (campo `language` del propio sitio).
 */

const http = require('./http');
const { makeResult, splitQuery, filterSpanish } = require('./base');

function create({ id = 'pelispanda', label = 'Pelispanda', baseUrl = 'https://pelispanda.org' } = {}) {
  const api = `${baseUrl}/wp-json/wpreact/v1`;

  async function search(query, options = {}) {
    const { title } = splitQuery(query);
    if (!title) return [];
    const data = await http.getJson(`${api}/search?query=${encodeURIComponent(title)}`, { ttlSeconds: 300 });

    const results = (data.results || []).map(item => {
      const kind = item.type === 'serie' ? 'series' : (item.type === 'anime' ? 'anime' : 'movie');
      const detailUrl = `${baseUrl}/${item.type}/${item.slug}`;
      return makeResult({ id, label }, {
        title: item.title,
        detailUrl,
        poster: item.featured || item.background_image || null,
        type: kind,
        year: item.year ? Number(item.year) : null,
        audio: item.language || null,
        quality: 'HD',
        seeders: null,
        size: null,
        // Los resultados de catálogo no traen magnet: se resuelve al abrir la ficha.
        torrentUrl: false,
        extraText: `${item.language || ''} ${item.genres || ''}`
      });
    });

    return filterSpanish(results, { assumeSpanish: true });
  }

  /**
   * Resuelve una ficha → array de resultados con magnets directos.
   * Acepta una URL de detalle (/pelicula/slug, /serie/slug, /anime/slug) o un resultado de search().
   */
  async function resolve(input, options = {}) {
    let slug = null;
    let kind = 'movie';

    if (typeof input === 'string') {
      const match = input.match(/\/(pelicula|serie|anime)\/([a-z0-9\-_]+)/i);
      if (!match) return [];
      kind = { pelicula: 'movie', serie: 'series', anime: 'anime' }[match[1].toLowerCase()];
      slug = match[2];
    } else if (input && input.detailUrl) {
      const match = input.detailUrl.match(/\/(pelicula|serie|anime)\/([a-z0-9\-_]+)/i);
      if (match) {
        kind = { pelicula: 'movie', serie: 'series', anime: 'anime' }[match[1].toLowerCase()];
        slug = match[2];
      }
    }
    if (!slug) return [];

    const endpointKind = kind === 'movie' ? 'movie' : (kind === 'anime' ? 'anime' : 'serie');
    const data = await http.getJson(`${api}/${endpointKind}/${slug}`);

    const downloads = Array.isArray(data.downloads) ? data.downloads : [];
    const results = [];
    for (const download of downloads) {
      const magnet = download.download_link || null;
      if (!magnet || !/^magnet:/i.test(magnet)) continue;
      const audio = download.language || data.language || 'Español';
      results.push(makeResult({ id, label }, {
        title: `${data.title}${download.quality ? ` ${download.quality}` : ''}`,
        quality: download.quality || null,
        size: download.size || null,
        audio,
        type: kind,
        detailUrl: `${baseUrl}/${data.type || 'pelicula'}/${slug}`,
        poster: data.featured || null,
        magnet,
        torrentUrl: false,
        seeders: null,
        extraText: audio
      }));
    }

    return filterSpanish(results, { assumeSpanish: true, allowVose: options.allowVose });
  }

  /** Últimas películas/series para el catálogo sin búsqueda. */
  async function latest() {
    const data = await http.getJson(`${api}/released`, { ttlSeconds: 300 }).catch(() => null);
    const items = Array.isArray(data) ? data : (data && data.results) || [];
    return filterSpanish(items.slice(0, 30).map(item => makeResult({ id, label }, {
      title: item.title,
      detailUrl: `${baseUrl}/${item.type || 'pelicula'}/${item.slug}`,
      poster: item.featured || item.background_image || null,
      type: item.type === 'serie' ? 'series' : (item.type === 'anime' ? 'anime' : 'movie'),
      year: item.year ? Number(item.year) : null,
      audio: item.language || null,
      quality: 'HD',
      torrentUrl: false
    })), { assumeSpanish: true });
  }

  return { id, label, baseUrl, search, latest, resolve, assumeSpanish: true };
}

module.exports = { create };
