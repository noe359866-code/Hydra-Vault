/**
 * Jackett Torznab integration.
 * Protect the public tunnel hostname with Cloudflare Access service-token authentication.
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
  const match = xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function attrValue(xml, name) {
  const match = xml.match(new RegExp("\\b" + name + "=[\"']([^\"']*)[\"']", 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseItems(xml) {
  const items = [];
  const matches = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  for (const item of matches) {
    const title = tagValue(item, 'title');
    const enclosure = (item.match(/<enclosure\b[^>]*>/i) || [''])[0];
    const link = tagValue(item, 'link') || attrValue(enclosure, 'url');
    const magnet = link.startsWith('magnet:?') ? link : (attrValue(item, 'magneturl') || '');
    const hashMatch = magnet.match(/urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i);
    const infoHash = (attrValue(item, 'infohash') || (hashMatch && hashMatch[1]) || '').toLowerCase();
    const seedersMatch = item.match(/<torznab:attr\b[^>]*name=["']seeders["'][^>]*value=["'](\d+)/i);
    const sizeMatch = item.match(/<torznab:attr\b[^>]*name=["']size["'][^>]*value=["'](\d+)/i);
    const seeders = Number(attrValue(item, 'seeders') || (seedersMatch && seedersMatch[1]) || 0);
    const size = Number(attrValue(item, 'size') || (sizeMatch && sizeMatch[1]) || 0);
    const qualityMatch = title.match(/\b(2160p|4k|1080p|720p|480p)\b/i);
    if (!title || (!magnet && !infoHash)) continue;
    items.push({
      title, magnet, infoHash,
      seeders: Number.isFinite(seeders) ? seeders : 0,
      size,
      quality: qualityMatch ? (/^(2160p|4k)$/i.test(qualityMatch[1]) ? '4K' : qualityMatch[1]) : 'Unknown'
    });
    if (items.length >= MAX_RESULTS) break;
  }
  return items;
}

function getJackettConfig() {
  const base = String(config.jackett.url || '').replace(/\/+$/, '');
  const apiKey = String(config.jackett.apiKey || '').trim();
  if (!base || !apiKey) return null;
  const headers = { Accept: 'application/rss+xml, application/xml, text/xml' };
  const clientId = String(config.jackett.accessClientId || '').trim();
  const clientSecret = String(config.jackett.accessClientSecret || '').trim();
  if (clientId || clientSecret) {
    if (!clientId || !clientSecret) {
      console.warn('[Jackett] Cloudflare Access requires both client ID and client secret.');
      return null;
    }
    headers['CF-Access-Client-Id'] = clientId;
    headers['CF-Access-Client-Secret'] = clientSecret;
  }
  return { base, apiKey, headers };
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
      headers: settings.headers,
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Jackett returned HTTP ' + response.status);
    return parseItems(await response.text()).map(item => ({
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
