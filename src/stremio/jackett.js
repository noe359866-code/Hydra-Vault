/**
 * Jackett Torznab integration.
 * Requires JACKETT_URL and JACKETT_API_KEY; indexers stay on the server.
 * Searches are read-only and time-bounded to protect serverless runtimes.
 */
const config = require('../config');

const TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.JACKETT_TIMEOUT_MS) || 5000, 15000));
const MAX_RESULTS = Math.max(1, Math.min(Number(process.env.JACKETT_MAX_RESULTS) || 8, 20));

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

function tagValue(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp('<' + safe + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + safe + '>', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function attrValue(xml, name) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp('\\b' + safe + '=["\\']([^"\\']*)["\\']', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseItems(xml) {
  const items = [];
  const matches = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  for (const item of matches) {
    const title = tagValue(item, 'title');
    const link = tagValue(item, 'link') || attrValue((item.match(/<enclosure\b[^>]*>/i) || [''])[0], 'url');
    const magnet = link.startsWith('magnet:?') ? link : (attrValue(item, 'magneturl') || '');
    const infoHash = (attrValue(item, 'infohash') || (magnet.match(/urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i) || [])[1] || '').toLowerCase();
    const seeders = Number(attrValue(item, 'seeders') || (item.match(/<torznab:attr\b[^>]*name=["']seeders["'][^>]*value=["'](\d+)/i) || [])[1] || 0);
    const size = Number(attrValue(item, 'size') || (item.match(/<torznab:attr\b[^>]*name=["']size["'][^>]*value=["'](\d+)/i) || [])[1] || 0);
    const qualityMatch = title.match(/\b(2160p|4k|1080p|720p|480p)\b/i);
    if (!title || (!magnet && !infoHash)) continue;
    items.push({
      title,
      magnet,
      infoHash,
      seeders: Number.isFinite(seeders) ? seeders : 0,
      size,
      quality: qualityMatch ? qualityMatch[1].toUpperCase() === '2160P' ? '4K' : qualityMatch[1] : 'Unknown'
    });
    if (items.length >= MAX_RESULTS) break;
  }
  return items;
}

function getJackettConfig() {
  const base = String(config.jackett.url || '').replace(/\/+$/, '');
  const apiKey = String(config.jackett.apiKey || '').trim();
  return base && apiKey ? { base, apiKey } : null;
}

async function searchJackett({ id, type, season, episode, title } = {}) {
  const settings = getJackettConfig();
  if (!settings || typeof fetch !== 'function') return [];
  const query = new URLSearchParams({ apikey: settings.apiKey, t: 'search' });
  if (id && /^tt\d+$/i.test(id)) query.set('imdbid', id);
  else if (title) query.set('q', title);
  else if (id) query.set('q', id);
  if (['series', 'anime', 'drama'].includes(type) && season != null && episode != null) {
    query.set('season', String(season));
    query.set('ep', String(episode));
  } else if (type === 'movie') {
    query.set('t', 'movie');
  }
  const endpoint = settings.base + '/api/v2.0/indexers/all/results/torznab/api?' + query.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Jackett returned HTTP ' + response.status);
    const xml = await response.text();
    return parseItems(xml).map(item => ({
      ...item,
      source_platform: 'Jackett',
      audio_lang: /\b(latino|dual|multi|spanish|español)\b/i.test(item.title) ? 'Detectado en título' : 'No especificado',
      subtitles: /\b(sub|subs|español|spanish)\b/i.test(item.title) ? 'Detectado en título' : 'No especificado',
      sizeLabel: item.size ? (item.size / (1024 ** 3)).toFixed(2) + ' GB' : 'N/D'
    }));
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('[Jackett] Search failed:', error.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchJackett, parseItems };
