/**
 * Scraper de LimeTorrent (limetorrent.net) — clon de LimeTorrents, índice internacional.
 *
 * - Búsqueda: GET /search/?catname=&q=<término> (variante clásica /search/all/<término>/seeds/1/)
 * - Listado:  tabla .table2 con nombre/enlace `/<slug>-<id>.html`, tamaño, seeds, leechers.
 * - Ficha:    muestra el "Torrent Hash" en claro → magnet construido localmente (sin descargar nada).
 *
 * OJO: sitio internacional → el filtro de español es OBLIGATORIO por nombre de release.
 */

const http = require('./http');
const { makeResult, splitQuery, filterSpanish, absoluteUrl } = require('./base');
const { buildMagnet, FALLBACK_TRACKERS } = require('./torrent');

function create({ id = 'limetorrent', label = 'LimeTorrent', baseUrl = 'https://limetorrent.net' } = {}) {

  /** Parsea la tabla de resultados. */
  function parseListingHtml(html, { limit = 25 } = {}) {
    const results = [];
    const seen = new Set();

    const rowRe = /<tr[^>]*bgcolor[^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rowMatch of html.matchAll(rowRe)) {
      const row = rowMatch[1];

      const linkMatch = row.match(/<a[^>]*href=["']((?:https?:\/\/[^"']*limetorrent\.net)?\/[^"']*?-\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]*>/g, '').replace(/\s{2,}/g, ' ').trim();
      const detailUrl = absoluteUrl(href, baseUrl);
      if (!detailUrl || seen.has(detailUrl) || !title) continue;
      seen.add(detailUrl);

      const categoryMatch = row.match(/-\s*in\s*<a[^>]*>([^<]+)<\/a>/i) || row.match(/in\s+([A-Za-z]+)\s*</i);
      const sizeMatch = row.match(/<td[^>]*>\s*([\d.,]+)(?:\s|&nbsp;)+([KMG]?B)\s*<\/td>/i);
      const seedMatch = row.match(/class=["']tdseed["'][^>]*>\s*([\d,]+)/i) || row.match(/<td[^>]*>\s*([\d,]+)\s*<\/td>\s*<td[^>]*>\s*[\d,]+\s*<\/td>/i);
      const seeders = seedMatch ? Number(seedMatch[1].replace(/,/g, '')) : null;

      results.push(makeResult({ id, label }, {
        title,
        detailUrl,
        size: sizeMatch ? `${sizeMatch[1].replace(',', '.')} ${sizeMatch[2]}` : null,
        seeders: Number.isInteger(seeders) ? seeders : null,
        type: /\/(series|tv|anime)\b/i.test(row) ? 'series' : 'movie',
        extraText: categoryMatch ? categoryMatch[1] : '',
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

    const url = `${baseUrl}/search/?catname=&q=${encodeURIComponent(term)}`;
    let html;
    try {
      html = await http.getHtml(url, { ttlSeconds: 300 });
    } catch {
      html = await http.getHtml(`${baseUrl}/search/all/${encodeURIComponent(term)}/seeds/1/`, { ttlSeconds: 300 });
    }
    // La escena internacional exige pistas explícitas de español.
    return filterSpanish(parseListingHtml(html), { assumeSpanish: false });
  }

  /** Últimos torrents (mezcla internacional; el filtro deja solo lo hispano). */
  async function latest() {
    const html = await http.getHtml(`${baseUrl}/latest100`, { ttlSeconds: 300 });
    return filterSpanish(parseListingHtml(html), { assumeSpanish: false });
  }

  /** Ficha → hash en claro → magnet. */
  async function resolve(input, options = {}) {
    const detailUrl = typeof input === 'string' ? input : (input && input.detailUrl);
    if (!detailUrl) return [];

    const html = await http.getHtml(detailUrl, { ttlSeconds: 900 });

    const hashMatch = html.match(/Torrent\s*Hash[\s\S]{0,120}?([A-Fa-f0-9]{40})/i)
      || html.match(/urn:btih:([A-Fa-f0-9]{40})/i);
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : null;
    const seedMatch = html.match(/Seeders\s*:\s*(\d+)/i);
    const sizeMatch = html.match(/Torrent\s*Size[\s\S]{0,120}?([\d.,]+)(?:\s|&nbsp;)+([KMG]?B)/i);

    if (!hashMatch) {
      // Ficha sin hash (posible captcha): devolvemos el metadato.
      if (name) {
        return filterSpanish([makeResult({ id, label }, { title: name, detailUrl, torrentUrl: false })], { assumeSpanish: false });
      }
      return [];
    }

    // Trackers listados en la ficha.
    const trackers = [...new Set(
      [...html.matchAll(/(udp|https?):\/\/[^\s"'<>]+\/announce/gi)].map(m => m[0])
    )].slice(0, 10);

    const magnet = buildMagnet(hashMatch[1], name, [...trackers, ...FALLBACK_TRACKERS]);
    return filterSpanish([makeResult({ id, label }, {
      title: name || decodeURIComponent(detailUrl.split('/').pop() || ''),
      detailUrl,
      magnet,
      infoHash: hashMatch[1].toLowerCase(),
      seeders: seedMatch ? Number(seedMatch[1]) : null,
      size: sizeMatch ? `${sizeMatch[1].replace(',', '.')} ${sizeMatch[2]}` : null,
      torrentUrl: false
    })], { assumeSpanish: false });
  }

  return { id, label, baseUrl, search, latest, resolve, parseListingHtml };
}

module.exports = { create };
