/**
 * Cliente HTTP compartido para los scrapers.
 * - fetch nativo de Node 18+ (sin dependencias externas).
 * - Timeout por petición + caché TTL en memoria (reduce golpes a las webs).
 * - User-Agent real para evitar bloqueos básicos.
 */

const config = require('../config');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'User-Agent': DEFAULT_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,la;q=0.8,en;q=0.7'
};

// ---------------------------------------------------------------------------
// Caché TTL en memoria (clave -> { expires, value })
// ---------------------------------------------------------------------------
const cache = new Map();
const CACHE_MAX_ENTRIES = 500;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value, ttlSeconds) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Borra la entrada más antigua (Map preserva el orden de inserción).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + ttlSeconds * 1000, value });
}

function clearCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Petición con timeout
// ---------------------------------------------------------------------------

function timeoutMs() {
  return Number(process.env.SCRAPER_TIMEOUT_MS) || 9000;
}

function cacheTtl() {
  return Number(process.env.SCRAPER_CACHE_TTL_SECONDS) || 600;
}

/**
 * GET o POST con timeout y decodificación opcional.
 * @returns {Promise<{status:number, url:string, text:string, headers:Headers, body:Buffer}>}
 */
async function request(url, {
  method = 'GET',
  headers = {},
  body = null,
  timeout = timeoutMs(),
  redirect = 'follow',
  cookies = ''
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      redirect,
      signal: controller.signal,
      headers: {
        ...BASE_HEADERS,
        ...(cookies ? { Cookie: cookies } : {}),
        ...headers
      },
      body
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      url: res.url || url,
      headers: res.headers,
      body: buffer,
      text: () => buffer.toString('utf8')
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GET que devuelve HTML como texto (con caché). */
async function getHtml(url, { ttlSeconds = cacheTtl(), ...rest } = {}) {
  const key = `html:${url}`;
  if (ttlSeconds > 0) {
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
  }
  const res = await request(url, rest);
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status} al pedir ${url}`);
    err.status = res.status;
    throw err;
  }
  const html = res.text();
  if (ttlSeconds > 0) cacheSet(key, html, ttlSeconds);
  return html;
}

/** GET que devuelve JSON (con caché). */
async function getJson(url, { ttlSeconds = cacheTtl(), ...rest } = {}) {
  const key = `json:${url}`;
  if (ttlSeconds > 0) {
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
  }
  const res = await request(url, rest);
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status} al pedir ${url}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(res.text());
  if (ttlSeconds > 0) cacheSet(key, data, ttlSeconds);
  return data;
}

/** GET binario (para .torrent) SIN caché de contenido. */
async function getBuffer(url, options = {}) {
  const res = await request(url, options);
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status} al pedir ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.body;
}

module.exports = {
  request,
  getHtml,
  getJson,
  getBuffer,
  cacheGet,
  cacheSet,
  clearCache,
  DEFAULT_UA,
  BASE_HEADERS
};
