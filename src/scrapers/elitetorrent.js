/**
 * Scraper de EliteTorrent (www.elitetorrent.com) — WordPress.
 *
 * - Búsqueda: GET /?s=<término>. Cada resultado lleva un icono de idioma
 *   (espanol.png = Castellano, latino.png = Latino, vose.png = Sub Español, ingles.png = NO).
 * - Ficha: los botones de descarga pasan por acortame-esto.com/s.php?i=<base64 anidado>
 *   que decodifica (4 × base64 → ROT13) a la URL real del .torrent en el propio sitio.
 * - .torrent → magnet por infohash.
 */

const http = require('./http');
const { makeResult, splitQuery, filterSpanish, stripTags } = require('./base');
const { torrentUrlToMagnet } = require('./torrent');

function create({ id = 'elitetorrent', label = 'EliteTorrent', baseUrl = 'https://www.elitetorrent.com' } = {}) {

  const LANGUAGE_ICONS = [
    { re: /images\/(?:espanol|espanol-castellano)\.png|espa[ñn]ol castellano/i, audio: 'Castellano', accepted: true },
    { re: /images\/latino\.png|espa[ñn]ol latino/i, audio: 'Latino', accepted: true },
    { re: /images\/vose\.png|subtitulado/i, audio: 'VOSE (Sub Español)', accepted: true },
    { re: /images\/ingles\.png|audio original ingles/i, audio: 'Inglés', accepted: false }
  ];

  function rot13(text) {
    return String(text).replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  /**
   * Decodifica el parámetro `i` de acortame-esto.com: capas de base64 + ROT13 final.
   * Devuelve https://…torrent o magnet:?…
   */
  function decodeProtectedLink(param) {
    let value = String(param || '').trim();
    for (let layer = 0; layer < 8; layer++) {
      if (/^https?:\/\//i.test(value) || /^magnet:/i.test(value)) return value;
      const rotated = rot13(value);
      if (/^https?:\/\//i.test(rotated) || /^magnet:/i.test(rotated)) return rotated;
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (!decoded || !/^[\x20-\x7e\u00a1-\u00ff\s]+$/.test(decoded)) return null;
      value = decoded;
    }
    return null;
  }

  /** Idioma según el icono más cercano al resultado. */
  function languageFor(windowHtml) {
    for (const { re, audio, accepted } of LANGUAGE_ICONS) {
      if (re.test(windowHtml)) return { audio, accepted };
    }
    return { audio: null, accepted: null }; // desconocido: decide el filtro genérico
  }

  /** Parsea la página de resultados (búsqueda o portada). */
  function parseListingHtml(html, { limit = 20, requireTokens = null } = {}) {
    const results = [];
    const seen = new Set();
    const detailRe = /href=["'](https?:\/\/[^"']*elitetorrent\.com\/(peliculas|series)\/[^"']+)["']/gi;

    for (const match of html.matchAll(detailRe)) {
      const url = match[1].replace(/\/$/, '') + '/';
      if (seen.has(url)) continue;
      seen.add(url);

      // Ventana de contexto para título, idioma, tamaño y calidad.
      const start = Math.max(match.index - 700, 0);
      const windowHtml = html.slice(start, match.index + 1200);

      // Título: la primera ancla con texto tras el enlace del póster.
      let title = null;
      const titleRe = /<a[^>]*href=["'][^"']*(?:peliculas|series)\/[^"']*["'][^>]*>([^<]{3,120})</gi;
      for (const titleMatch of windowHtml.matchAll(titleRe)) {
        const text = stripTags(titleMatch[1]);
        if (text && !/^\d/.test(text) && !/^(Ver|Descargar|Siguenos|Inicio)/i.test(text)) {
          title = text;
          break;
        }
      }
      if (!title) {
        title = decodeURIComponent(url.split('/').filter(Boolean).pop() || '')
          .replace(/-/g, ' ')
          .replace(/\b(peliculas|series)\b/gi, '')
          .trim();
      }
      if (!title || title.length < 2) continue;

      if (requireTokens) {
        const slug = url.toLowerCase();
        if (!requireTokens.some(token => token.length > 2 && slug.includes(token))) continue;
      }

      const lang = languageFor(windowHtml);
      const sizeMatch = windowHtml.match(/(\d+(?:[.,]\d+)?)\s*GBs?/i);
      results.push(makeResult({ id, label }, {
        title,
        detailUrl: url,
        size: sizeMatch ? `${sizeMatch[1].replace(',', '.')} GB` : null,
        audio: lang.audio,
        type: /\/series\//i.test(url) ? 'series' : 'movie',
        torrentUrl: false,
        extraText: lang.audio || ''
      }));
      if (results.length >= limit) break;
    }
    return results;
  }

  async function search(query, options = {}) {
    const { title } = splitQuery(query);
    const term = (title || '').trim();
    if (!term) return [];
    const url = `${baseUrl}/?s=${encodeURIComponent(term)}`;
    const html = await http.getHtml(url, { ttlSeconds: 300 });
    const tokens = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
    return filterSpanish(parseListingHtml(html, { requireTokens: tokens }), { assumeSpanish: false });
  }

  /** Portada: últimos estrenos y series. */
  async function latest() {
    const html = await http.getHtml(`${baseUrl}/`, { ttlSeconds: 300 });
    const results = parseListingHtml(html, { limit: 30 })
      .filter(result => result.audio !== 'Inglés');
    return filterSpanish(results, { assumeSpanish: true });
  }

  /** Ficha → magnet. */
  async function resolve(input, options = {}) {
    const detailUrl = typeof input === 'string' ? input : (input && input.detailUrl);
    if (!detailUrl) return [];

    const html = await http.getHtml(detailUrl, { ttlSeconds: 900 });
    const results = [];

    // Idioma declarado en la ficha: "Idioma: Español" / "Ingles Subtitulado"…
    const langMatch = html.match(/Idioma:<?(?:\/b|\/strong)?>?\s*([A-Za-zÁÉÍÓÚñ :\-\[\]]+)</i);
    const declaredLang = langMatch ? langMatch[1].trim() : null;

    const protectedRe = /acortame-esto\.com\/s\.php\?i=([A-Za-z0-9+/=]+)/gi;
    const seen = new Set();
    for (const match of html.matchAll(protectedRe)) {
      const real = decodeProtectedLink(match[1]);
      if (!real || seen.has(real)) continue;
      seen.add(real);
      try {
        if (/^magnet:/i.test(real)) {
          const infoHash = (real.match(/xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/) || [])[1] || null;
          results.push(makeResult({ id, label }, {
            title: decodeURIComponent((real.match(/[?&]dn=([^&]+)/) || [])[1] || '') || null,
            detailUrl,
            magnet: real,
            infoHash,
            audio: declaredLang
          }));
        } else {
          const parsed = await torrentUrlToMagnet(real, http);
          results.push(makeResult({ id, label }, {
            title: parsed.name || null,
            detailUrl,
            magnet: parsed.magnet,
            infoHash: parsed.infoHash,
            torrentUrl: real,
            audio: declaredLang,
            size: parsed.length ? `${(parsed.length / (1024 * 1024 * 1024)).toFixed(2)} GB` : null
          }));
        }
      } catch {
        // Enlace fallido: continúa con el siguiente.
      }
    }

    if (!results.length) {
      const titleMatch = html.match(/Descargar\s+([^<]+?)\s+por torrent/i);
      if (titleMatch) {
        results.push(makeResult({ id, label }, {
          title: titleMatch[1].trim(),
          detailUrl,
          torrentUrl: false,
          audio: declaredLang
        }));
      }
    }

    return filterSpanish(results, { assumeSpanish: false, allowVose: options.allowVose });
  }

  return { id, label, baseUrl, search, latest, resolve, parseListingHtml, decodeProtectedLink };
}

module.exports = { create };
