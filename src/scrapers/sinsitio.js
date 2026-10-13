/**
 * Scraper de SinSitio (www.sinsitio.site) — DataLife Engine.
 *
 * - Búsqueda: GET /index.php?do=search&subaction=search&story=<término>
 * - Ficha:    /<categoría>/<id>-<slug>.html con ficha técnica y enlace ddlUrl.php?url=<base64>
 *             cuyo parámetro decodifica a /index.php?do=download&id=<id> (.torrent directo).
 * - .torrent → magnet por infohash.
 * - Todo el catálogo es de la escena en español (castellano/dual).
 */

const http = require('./http');
const { makeResult, splitQuery, filterSpanish, stripTags } = require('./base');
const { torrentUrlToMagnet } = require('./torrent');

function create({ id = 'sinsitio', label = 'SinSitio', baseUrl = 'https://www.sinsitio.site' } = {}) {

  /** Parsea la página de resultados de búsqueda. */
  function parseSearchHtml(html, { limit = 20 } = {}) {
    const results = [];
    const seen = new Set();
    // Enlaces de posts: /categoria/12345-slug.html
    const anchorRe = /<a[^>]*href=["'](?:https?:\/\/[^"']*sinsitio\.site)?(\/[a-z0-9\-_]+\/(\d+)-[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchorRe)) {
      const path = match[1].split('#')[0];
      const inner = stripTags(match[3]);
      const url = `${baseUrl}${path}`;
      if (seen.has(url) || !inner || inner.length < 3) continue;
      // Ignora enlaces de navegación/comentarios repetidos.
      if (/^Leer mas|^Leer más|Comentarios|Foto|Noticia$/i.test(inner)) continue;
      seen.add(url);
      results.push(makeResult({ id, label }, {
        title: inner,
        detailUrl: url,
        type: /\/(series|serie-?|tv)[\-/]/i.test(path) ? 'series' : 'movie',
        torrentUrl: false
      }));
      if (results.length >= limit) break;
    }
    return results;
  }

  async function search(query, options = {}) {
    const { title } = splitQuery(query);
    const term = (title || '').trim();
    if (!term) return [];
    const url = `${baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(term)}`;
    const html = await http.getHtml(url, { ttlSeconds: 300 });
    return filterSpanish(parseSearchHtml(html), { assumeSpanish: true });
  }

  /** Portada: estrenos recientes. */
  async function latest() {
    const html = await http.getHtml(`${baseUrl}/`, { ttlSeconds: 300 });
    return filterSpanish(parseSearchHtml(html, { limit: 30 }), { assumeSpanish: true });
  }

  /**
   * Ficha → magnets. La ficha contiene enlaces:
   * <a href="/ddlUrl.php?url=<base64>&name=...">🎬 Nombre del torrent</a>
   */
  async function resolve(input, options = {}) {
    const detailUrl = typeof input === 'string' ? input : (input && input.detailUrl);
    if (!detailUrl) return [];

    const html = await http.getHtml(detailUrl, { ttlSeconds: 900 });
    const results = [];

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const baseTitle = titleMatch ? stripTags(titleMatch[1]).trim() : null;

    // Enlaces de descarga ddlUrl.php?url=BASE64
    const ddlRe = /ddlUrl\.php\?url=([A-Za-z0-9%]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(ddlRe)) {
      try {
        const encoded = decodeURIComponent(match[1]);
        const inner = stripTags(match[2]);
        let decoded = Buffer.from(encoded, 'base64').toString('utf8');
        // Puede haber doble codificación base64 (https://... repetido).
        if (!/^https?:\/\//i.test(decoded)) {
          const second = Buffer.from(decoded, 'base64').toString('utf8');
          if (/^https?:\/\//i.test(second)) decoded = second;
        }
        const downloadUrl = decoded.startsWith('http') ? decoded : `${baseUrl}${decoded}`;
        const parsed = await torrentUrlToMagnet(downloadUrl, http);
        results.push(makeResult({ id, label }, {
          title: parsed.name || inner || baseTitle,
          detailUrl,
          magnet: parsed.magnet,
          infoHash: parsed.infoHash,
          torrentUrl: downloadUrl,
          size: parsed.length ? `${(parsed.length / (1024 * 1024 * 1024)).toFixed(2)} GB` : null
        }));
      } catch {
        // Enlace individual fallido: continúa.
      }
    }

    if (!results.length && baseTitle) {
      results.push(makeResult({ id, label }, { title: baseTitle, detailUrl, torrentUrl: false }));
    }

    return filterSpanish(results, { assumeSpanish: true, allowVose: options.allowVose });
  }

  return { id, label, baseUrl, search, latest, resolve, parseSearchHtml, assumeSpanish: true };
}

module.exports = { create };
