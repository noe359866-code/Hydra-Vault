/**
 * Scraper del motor DonTorrent (dontorrent.meme) y MejorTorrent (www47.mejortorrent.eu).
 * Ambos comparten software: misma estructura de URLs y de descargas protegidas.
 *
 * - Búsqueda:  POST /buscar  con campo de formulario `valor` (el GET /buscar ya no devuelve resultados).
 * - Detalles:  /pelicula/<id>/<slug>  ·  /serie/<id>/<id>/<slug>
 * - Descarga:  anclas `a[download]` directas o `a.protected-download[data-content-id][data-tabla]`
 *              que se resuelven con PoW vía /api_validate_pow.php.
 * - .torrent → magnet por infohash (bencode local, sin dependencias).
 */

const http = require('./http');
const { makeResult, splitQuery, filterSpanish, absoluteUrl, stripTags } = require('./base');
const { resolveProtectedDownload } = require('./pow');
const { torrentUrlToMagnet, buildMagnet } = require('./torrent');

function create({
  id = 'dontorrent',
  label = 'DonTorrent',
  baseUrl = 'https://dontorrent.meme'
} = {}) {

  const RE_DIRECT_ANCHOR = /<a[^>]*href=("([^"]*)"|'([^']*)')[^>]*download[^>]*target=["']?_blank[^>]*>(?:\s|\S)*?<\/a>|<a[^>]*download[^>]*target=["']?_blank[^>]*href=("([^"]*)"|'([^']*)')[^>]*>/gi;

  function attr(tag, name) {
    const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
    return match ? match[1] : null;
  }

  /** Extrae enlaces de descarga (directos y protegidos) de una ficha. */
  function extractDownloadLinks(html, pageUrl) {
    const origin = new URL(pageUrl).origin;
    const direct = new Set();
    const protectedItems = [];

    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const tag = match[0];
      const isDownloadButton = />(?:\s*)Descargar(?:\s*)</i.test(tag) || /class=["'][^"']*protected-download/i.test(tag);
      if (!isDownloadButton) continue;

      const classes = attr(tag, 'class') || '';
      const href = attr(tag, 'href');
      const contentId = attr(tag, 'data-content-id');
      const tabla = attr(tag, 'data-tabla');

      if (classes.includes('protected-download') || (contentId && tabla)) {
        if (contentId && tabla) protectedItems.push({ contentId, tabla });
      } else if (href && /download|torrent|descargar/i.test(tag) && /download/i.test(tag)) {
        direct.add(absoluteUrl(href, origin));
      }
    }

    // Red de seguridad: anclas directas con atributo `download` explícito.
    for (const match of html.matchAll(RE_DIRECT_ANCHOR)) {
      const href = match[2] || match[3] || match[5] || match[6];
      if (href && !/^(javascript|#)/i.test(href)) direct.add(absoluteUrl(href, origin));
    }

    return { direct: [...direct].filter(Boolean), protected: protectedItems };
  }

  /** Parsea la página de resultados de búsqueda (POST /buscar). */
  function parseSearchHtml(html, { limit = 20 } = {}) {
    const results = [];
    const seen = new Set();

    // Resultados: <a class="...text-decoration-none..." href="/pelicula/123/Slug"> ó /serie/123/123/Slug
    const anchorRe = /<a[^>]*href=["']((?:\/)?(?:pelicula|serie)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchorRe)) {
      const href = match[1];
      const inner = stripTags(match[2]);
      const url = absoluteUrl(href, baseUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const isSerie = /\/serie\//i.test(url);
      const title = inner
        || decodeURIComponent(url.split('/').pop() || '')
        .replace(/-/g, ' ');

      if (!title || title.length < 2) continue;
      results.push(makeResult({ id, label }, {
        title,
        detailUrl: url,
        type: isSerie ? 'series' : 'movie',
        torrentUrl: false
      }));
      if (results.length >= limit) break;
    }
    return results;
  }

  async function search(query, options = {}) {
    const { title } = splitQuery(query);
    const term = (title || '').trim();
    if (!term || term.length < 3) return [];

    const searchUrl = `${baseUrl}/buscar`;
    const body = new URLSearchParams({ valor: term }).toString();

    let html;
    try {
      const res = await http.request(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${baseUrl}/`
        },
        body,
        cookies: ''
      });
      html = res.text();
    } catch (err) {
      // Fallback al patrón antiguo GET /buscar/<término> por si el motor lo restaura.
      html = await http.getHtml(`${baseUrl}/buscar/${encodeURIComponent(term)}`, { ttlSeconds: 300 });
    }

    return filterSpanish(parseSearchHtml(html), { assumeSpanish: true });
  }

  /** Portada: /inicio lista las últimas novedades (películas y series). */
  async function latest() {
    const html = await http.getHtml(`${baseUrl}/inicio`, { ttlSeconds: 300 })
      .catch(() => http.getHtml(`${baseUrl}/`));
    const results = [];
    const seen = new Set();
    const anchorRe = /<a[^>]*href=["']((?:\/)?(?:pelicula|serie)\/[^"']+)["'][^>]*>/gi;
    for (const match of html.matchAll(anchorRe)) {
      const url = absoluteUrl(match[1], baseUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = decodeURIComponent(url.split('/').pop() || '').replace(/-/g, ' ');
      if (!title || title.length < 3) continue;
      results.push(makeResult({ id, label }, {
        title,
        detailUrl: url,
        type: /\/serie\//i.test(url) ? 'series' : 'movie',
        torrentUrl: false
      }));
      if (results.length >= 30) break;
    }
    return filterSpanish(results, { assumeSpanish: true });
  }

  /**
   * Resuelve una ficha → magnets reales.
   * Acepta URL de detalle o un resultado de search()/latest().
   */
  async function resolve(input, options = {}) {
    const detailUrl = typeof input === 'string' ? input : (input && input.detailUrl);
    if (!detailUrl) return [];

    const html = await http.getHtml(detailUrl, { ttlSeconds: 900 });
    const links = extractDownloadLinks(html, detailUrl);

    const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const baseTitle = nameMatch ? stripTags(nameMatch[1]).replace(/^Descargar\s+/i, '').replace(/\s+por torrent.*$/i, '').replace(/\s+A[ñn]o\s+\d{4}.*$/i, '').trim() : null;

    const results = [];

    // 1) Enlaces directos (.torrent)
    for (const torrentUrl of links.direct.slice(0, 10)) {
      if (!/\.torrent($|\?)|torrent/i.test(torrentUrl)) continue;
      try {
        const parsed = await torrentUrlToMagnet(torrentUrl, http);
        results.push(makeResult({ id, label }, {
          title: parsed.name || baseTitle,
          detailUrl,
          magnet: parsed.magnet,
          infoHash: parsed.infoHash,
          torrentUrl,
          size: parsed.length ? `${(parsed.length / (1024 * 1024 * 1024)).toFixed(2)} GB` : null,
          torrentUrlResolved: true
        }));
      } catch {
        // .torrent individual fallido: continúa con el resto.
      }
    }

    // 2) Enlaces protegidos (PoW)
    for (const item of links.protected.slice(0, 6)) {
      try {
        const origin = new URL(detailUrl).origin;
        const downloadUrl = await resolveProtectedDownload(http, origin, detailUrl, item);
        const parsed = await torrentUrlToMagnet(downloadUrl, http);
        results.push(makeResult({ id, label }, {
          title: parsed.name || baseTitle,
          detailUrl,
          magnet: parsed.magnet,
          infoHash: parsed.infoHash,
          torrentUrl: downloadUrl
        }));
      } catch {
        // PoW/captcha: se omite este enlace.
      }
    }

    if (!results.length && baseTitle) {
      // Devuelve al menos el metadato (para el buscador del panel) sin magnet.
      results.push(makeResult({ id, label }, { title: baseTitle, detailUrl, torrentUrl: false }));
    }

    return filterSpanish(results, { assumeSpanish: true, allowVose: options.allowVose });
  }

  return { id, label, baseUrl, search, latest, resolve, parseSearchHtml, extractDownloadLinks, assumeSpanish: true };
}

module.exports = { create };
