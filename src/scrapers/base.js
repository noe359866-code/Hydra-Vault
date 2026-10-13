/**
 * Helpers comunes de los scrapers + normalización de resultados.
 */

const { evaluateSpanish, parseSize, parseQuality, parseYear, parseSeasonEpisode } = require('./language');

/**
 * Resultado normalizado de un scraper.
 * magnet queda null hasta que se "resuelve" (resolve()) o si el sitio lo entrega directo.
 */
function makeResult(scraper, data) {
  const title = String(data.title || '').trim();
  const searchText = `${title} ${data.extraText || ''}`;
  const episodeInfo = parseSeasonEpisode(title);

  return {
    site: scraper.id,
    siteLabel: scraper.label,
    title,
    quality: data.quality || parseQuality(searchText) || 'N/D',
    size: data.size || parseSize(searchText) || null,
    seeders: Number.isInteger(data.seeders) ? data.seeders : null,
    year: data.year || parseYear(title),
    audio: data.audio || null,
    subtitles: data.subtitles || null,
    type: data.type || null,
    season: data.season !== undefined ? data.season : episodeInfo.season,
    episode: data.episode !== undefined ? data.episode : episodeInfo.episode,
    isPack: data.isPack !== undefined ? data.isPack : episodeInfo.isPack,
    detailUrl: data.detailUrl || null,
    poster: data.poster || null,
    magnet: data.magnet || null,
    infoHash: data.infoHash || null,
    torrentUrl: data.torrentUrl || null,
    needsResolution: !(data.magnet || data.torrentUrl === false),
    extraText: data.extraText || ''
  };
}

/** Divide una consulta de búsqueda en { title, season, episode } */
function splitQuery(query = '') {
  const source = String(query || '').trim();
  const info = parseSeasonEpisode(source);
  let title = source;
  if (info.season !== null || info.episode !== null) {
    title = source
      .replace(/\bS\d{1,2}\s?E\d{1,4}\b/i, ' ')
      .replace(/\b\d{1,2}x\d{1,4}\b/i, ' ')
      .replace(/\b(?:temporada|season)\s*\d{1,2}\b/ig, ' ')
      .replace(/\b(?:cap[íi]?tulo|episodio|ep)?\.?\s*\d{1,4}\b/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return { title, season: info.season, episode: info.episode };
}

/** HTML entity decode básico. */
function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ');
}

/** Texto de una etiqueta HTML (quita tags anidados y entidades). */
function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s{2,}/g, ' ').trim();
}

function absoluteUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/** Filtra resultados dejando solo contenido de habla hispana. */
function filterSpanish(results, { assumeSpanish = false, allowVose = true } = {}) {
  return results
    .map(result => {
      const verdict = evaluateSpanish(`${result.title} ${result.audio || ''} ${result.extraText || ''}`, { assumeSpanish, allowVose });
      return { ...result, spanish: verdict };
    })
    .filter(result => {
      if (!result.spanish.accepted) return false;
      if (!result.audio) result.audio = result.spanish.label;
      return true;
    });
}

module.exports = {
  makeResult,
  splitQuery,
  decodeEntities,
  stripTags,
  absoluteUrl,
  filterSpanish
};
