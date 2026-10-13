/**
 * Registro de scrapers y API de alto nivel.
 *
 * Cada solicitud de búsqueda se reparte en PARALELO a todos los sitios activos,
 * se filtra a contenido de habla hispana (latino / castellano / español) y se
 * devuelve unificado. Los dominios rotan con frecuencia: se pueden sobrescribir
 * por variables de entorno (SCRAPER_<SITIO>_URL).
 */

const config = require('../config');

const pelispanda = require('./pelispanda');
const dontorrent = require('./dontorrent');
const sinsitio = require('./sinsitio');
const elitetorrent = require('./elitetorrent');
const limetorrent = require('./limetorrent');

function envUrl(site, fallback) {
  const value = process.env[`SCRAPER_${site.toUpperCase()}_URL`];
  return value ? String(value).replace(/\/+$/, '') : fallback;
}

function allowVose() {
  return String(process.env.SCRAPER_ALLOW_VOSE || 'true') !== 'false';
}

function enabledSites() {
  const list = String(process.env.SCRAPER_SITES || 'dontorrent,mejortorrent,pelispanda,elitetorrent,sinsitio,limetorrent')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

// ---------------------------------------------------------------------------
// Registro (orden = prioridad al truncar resultados)
// ---------------------------------------------------------------------------

const FACTORIES = [
  () => dontorrent.create({ id: 'dontorrent', label: 'DonTorrent', baseUrl: envUrl('dontorrent', 'https://dontorrent.meme') }),
  () => dontorrent.create({ id: 'mejortorrent', label: 'MejorTorrent', baseUrl: envUrl('mejortorrent', 'https://www47.mejortorrent.eu') }),
  () => pelispanda.create({ id: 'pelispanda', label: 'Pelispanda', baseUrl: envUrl('pelispanda', 'https://pelispanda.org') }),
  () => elitetorrent.create({ id: 'elitetorrent', label: 'EliteTorrent', baseUrl: envUrl('elitetorrent', 'https://www.elitetorrent.com') }),
  () => sinsitio.create({ id: 'sinsitio', label: 'SinSitio', baseUrl: envUrl('sinsitio', 'https://www.sinsitio.site') }),
  () => limetorrent.create({ id: 'limetorrent', label: 'LimeTorrent', baseUrl: envUrl('limetorrent', 'https://limetorrent.net') })
];

let registry = null;
const siteStatus = new Map(); // id -> { ok, lastChecked, latencyMs, lastError }

function getRegistry() {
  if (registry) return registry;
  const enabled = enabledSites();
  registry = FACTORIES.map(factory => factory()).filter(scraper => enabled.has(scraper.id));
  return registry;
}

function getScraper(id) {
  return getRegistry().find(scraper => scraper.id === id) || null;
}

function markStatus(id, startedAt, error = null) {
  siteStatus.set(id, {
    ok: !error,
    lastChecked: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    lastError: error ? String(error.message || error).slice(0, 200) : null
  });
}

async function runScraper(scraper, method, ...args) {
  const startedAt = Date.now();
  try {
    const result = await scraper[method](...args);
    markStatus(scraper.id, startedAt);
    return result;
  } catch (err) {
    markStatus(scraper.id, startedAt, err);
    return [];
  }
}

/** Límite configurable de resultados por sitio. */
function perSiteLimit() {
  return Number(process.env.SCRAPER_MAX_PER_SITE) || 10;
}

/**
 * Busca en TODOS los sitios activos en paralelo y filtra por idioma español.
 * @param {object} options
 * @param {string} options.query término de búsqueda
 * @param {'movie'|'series'|'anime'|null} [options.type]
 * @param {number|null} [options.season]
 * @param {number|null} [options.episode]
 * @param {string[]} [options.sites] subconjunto de sitios
 * @returns {Promise<{ results: object[], errors: object[] }>}
 */
async function searchAll({ query, type = null, season = null, episode = null, sites = null } = {}) {
  const term = String(query || '').trim();
  if (!term) return { results: [], errors: [] };

  const scrapers = getRegistry().filter(scraper => !sites || sites.includes(scraper.id));

  const settled = await Promise.allSettled(
    scrapers.map(scraper => runScraper(scraper, 'search', term, { type, season, episode }))
  );

  const results = [];
  const errors = [];
  settled.forEach((outcome, index) => {
    const scraper = scrapers[index];
    if (outcome.status === 'fulfilled') {
      let items = outcome.value || [];
      if (type) {
        items = items.filter(item => !item.type || item.type === type);
      }
      // Recorta por sitio manteniendo el orden del propio sitio (relevancia).
      results.push(...items.slice(0, perSiteLimit()));
    } else {
      errors.push({ site: scraper.id, error: String(outcome.reason && outcome.reason.message || outcome.reason) });
    }
  });

  return { results, errors };
}

/**
 * Resultados "novedades" de todos los sitios (para catálogos sin búsqueda).
 */
async function latestAll({ sites = null } = {}) {
  const scrapers = getRegistry().filter(scraper => !sites || sites.includes(scraper.id));
  const settled = await Promise.allSettled(
    scrapers.map(scraper => runScraper(scraper, 'latest'))
  );
  const results = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      results.push(...(outcome.value || []).slice(0, perSiteLimit()));
    }
  });
  return results;
}

/**
 * Resuelve un resultado concreto → magnets reales.
 * @param {string} siteId dontorrent | mejortorrent | pelispanda | …
 * @param {string|object} target URL de ficha o resultado previo
 */
async function resolveResult(siteId, target, options = {}) {
  const scraper = getScraper(siteId);
  if (!scraper) throw new Error(`Sitio desconocido: ${siteId}`);
  const startedAt = Date.now();
  try {
    const results = await scraper.resolve(target, { allowVose: allowVose(), ...options });
    markStatus(siteId, startedAt);
    return results;
  } catch (err) {
    markStatus(siteId, startedAt, err);
    return [];
  }
}

/** Estado de salud de cada sitio. */
function status() {
  return getRegistry().map(scraper => ({
    id: scraper.id,
    label: scraper.label,
    baseUrl: scraper.baseUrl,
    ...(siteStatus.get(scraper.id) || { ok: null, lastChecked: null, latencyMs: null, lastError: null })
  }));
}

module.exports = {
  getRegistry,
  getScraper,
  searchAll,
  latestAll,
  resolveResult,
  status,
  allowVose,
  enabledSites
};
