/**
 * Filtro de idioma: SOLO se acepta contenido de habla hispana
 * (español castellano, latino, dual con español, o subtitulado al español).
 *
 * - Sitios 100 % en español (dontorrent, mejortorrent, pelispanda, sinsitio):
 *   se asume español salvo pistas claras de versión original sin subtítulos.
 * - Sitios internacionales (limetorrent): el release DEBE contener pistas de
 *   español; si no, se descarta.
 *
 * Además extrae calidad, tamaño, año, temporada/episodio de los nombres de release.
 */

// ---------------------------------------------------------------------------

const SPANISH_HINTS = [
  /castellano/i,
  /espa[ñn]ol/i,
  /espanol/i,
  /\besp\b/i,
  /\bspa(nish)?\b/i,
  /spanish/i,
  /latino/i,
  /\blatam\b/i,
  /\blat\b/i,
  /\bdual\b/i,               // "Dual Audio" casi siempre incluye español en la escena hispana
  /\bvose\b|\bv\.?o\.?s\.?e?\b/i,  // VOS / VOSE: versión original subtitulada al español
  /\bsub(s|\s*titulado|\s*esp)?\b.*espa/i,
  /\besub\b/i,
  /\bcast\b/i,
  /\bsubtitulad[oa]s?\b/i
];

// Pistas de versión SIN español (solo audio original sin subtítulos).
const NON_SPANISH_HINTS = [
  /\bingl[eé]s\b(?!\s*(?:sub|subtitulad))/i,
  /\benglish\b(?!\s*(?:sub|subtitulad))/i,
  /\bvo\b(?!\s*[se])/i,          // "VO" a secas
  /\bv\.?o\.?(?:\s|$|\])/i,
  /\boriginal audio\b/i,
  /\benglish audio\b/i,
  /\btruefrench\b/i,
  /\bfrench\b/i,
  /\bitalian\b/i,
  /\bgerman\b/i,
  /\bdeutsch\b/i,
  /\bportugues(e)?\b(?!\s.*espa)/i,
  /\brussian\b/i,
  /\bjapanese\b(?!\s.*espa)/i,
  /\bjap\b(?!ones)(?!\s.*espa)/i,
  /\bsub arab\b/i,
  /\bhindi\b/i,
  /\btelugu\b/i,
  /\btamil\b/i,
  /\bkorean\b/i,
  /\bmulti(?!.*(?:espa|cast|latin))/i // "Multi" sin mención de español se descarta por prudencia
];

const QUALITY_PATTERNS = [
  { re: /\b2160p?\b|\b4k\b|\buhd\b/i, quality: '4K' },
  { re: /\b1080p?\b/i, quality: '1080p' },
  { re: /\b720p?\b/i, quality: '720p' },
  { re: /\b480p?\b/i, quality: '480p' },
  { re: /\bbluray-?remux|\bremux\b/i, quality: 'Remux' },
  { re: /\bbd?rip|br-?rip|blu-?ray/i, quality: 'BDrip' },
  { re: /\bdvd-?rip|\bdvdr\b|\bdvd\b/i, quality: 'DVDRip' },
  { re: /\bweb-?dl\b/i, quality: 'WEB-DL' },
  { re: /\bweb-?rip\b|\bweb\b/i, quality: 'WEBRip' },
  { re: /\bhdtv\b/i, quality: 'HDTV' },
  { re: /\bscreener|\bscr\b|\bts\b|\btc\b|\bhdcam|\bcam\b/i, quality: 'Screener' },
  { re: /\bmicro-?hd\b/i, quality: 'MicroHD' },
  { re: /\bhevc|x265/i, quality: 'HEVC' }
];

/** Extrae "1.4 GB", "870 MB"… */
function parseSize(text) {
  const match = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(GB|MB|TB|Gb|Mb|gb|mb)/);
  if (!match) return null;
  const value = match[1].replace(',', '.');
  const unit = match[2].toUpperCase();
  return `${value} ${unit}`;
}

function parseQuality(text) {
  const source = String(text || '');
  for (const { re, quality } of QUALITY_PATTERNS) {
    if (re.test(source)) {
      // "HEVC" solo cuenta si no hay una calidad de resolución más explícita antes.
      if (quality === 'HEVC' && /\b2160p|1080p|720p|480p\b/i.test(source)) continue;
      return quality;
    }
  }
  return null;
}

function parseYear(text) {
  const match = String(text || '').match(/\b(19[5-9]\d|20[0-6]\d)\b/);
  return match ? Number(match[1]) : null;
}

/** Etiqueta de idioma amable para la ficha de Stremio. */
function spanishLabel(text) {
  const source = String(text || '');
  const hasLatino = /latino|\blat\b|\blatam\b/i.test(source);
  const hasCastellano = /castellano|espa[ñn]ol|espanol|\besp\b|spanish/i.test(source);
  const hasSubs = /vo?se|\bsub(s)?\b.*(?:espa|cast|es|spanish)|subtitulad/i.test(source);
  const hasDual = /\bdual\b/i.test(source);
  const parts = [];
  if (hasLatino) parts.push('Latino');
  if (hasCastellano) parts.push('Castellano');
  if (!hasLatino && !hasCastellano && hasSubs) parts.push('VOSE (Sub Español)');
  else if (hasSubs && (hasLatino || hasCastellano)) parts.push('Sub Español');
  if (hasDual && !parts.includes('Latino')) parts.push('Dual');
  return parts.join(' + ') || 'Español';
}

// ---------------------------------------------------------------------------

/**
 * Decide si un release es "de habla hispana".
 * Regla: se ACEPTA cuando hay pistas de español (latino/castellano/subs español/dual);
 * sin pistas, solo se acepta si el sitio es español por definición.
 */
function evaluateSpanish(text, { assumeSpanish = false, allowVose = true } = {}) {
  const source = String(text || '');

  const hasSpanishHint = SPANISH_HINTS.some(re => re.test(source));
  const hasNonSpanishHint = NON_SPANISH_HINTS.some(re => re.test(source));

  // Con pistas de español manda el español (un "Latino - Inglés" es dual: se acepta).
  if (hasSpanishHint) {
    const isVose = /\bv\.?o\.?s\.?e?\b|\bsub(s)?\b.*(?:espa|cast|spanish)|subtitulad/i.test(source)
      && !/castellano|espa[ñn]ol|latino|dual/i.test(source);
    if (isVose && !allowVose) {
      return { accepted: false, reason: 'VOSE desactivado', label: null };
    }
    return { accepted: true, reason: 'pistas de español', label: spanishLabel(source) };
  }

  // Sin pistas de español: si parece audio extranjero, fuera.
  if (hasNonSpanishHint) {
    return { accepted: false, reason: 'audio no español', label: null };
  }

  // Sitios de la escena española: se asume castellano/latino por defecto.
  if (assumeSpanish) {
    return { accepted: true, reason: 'sitio español', label: 'Español' };
  }

  return { accepted: false, reason: 'sin pistas de español', label: null };
}

// ---------------------------------------------------------------------------

const SEASON_EPISODE_PATTERNS = [
  { re: /\bS(\d{1,2})\s?E(\d{1,4})\b/i, season: 1, episode: 2 },                 // S01E02
  { re: /\b(\d{1,2})x(\d{1,4})\b/i, season: 1, episode: 2 },                     // 1x02
  { re: /temporada\s*(\d{1,2}).*?(?:cap[íi]?tulo|episodio)?\s*(\d{1,4})\b/i, season: 1, episode: 2 },
  { re: /\bt(?:emp)?\.?\s*(\d{1,2})\s*[-_. ]?\s*(?:cap)?\.?\s*(\d{1,4})\b/i, season: 1, episode: 2 },
  { re: /\b(\d{1,2})\s?-\s?(\d{1,4})\s?(?:cap|episodio)\b/i, season: 1, episode: 2 }
];

const EPISODE_ONLY_PATTERN = /(?:^|[\s\-_.\[(])(?:cap[íi]?tulo|episodio|ep)\.?\s*(\d{1,4})\b/i;
const PACK_PATTERN = /\b(?:cap\.?\s*(\d{1,4})\s*[-–a]\s*(\d{1,4})|temporada\s*(\d{1,2})\s*completa|completa|complete)\b/i;
const ABSOLUTE_EPISODE_PATTERNS = [
  /(?:^|[\s\-_[(])(\d{1,4})(?:\s)?(?:v\d)?(?:\s)?(?:\[[^\]]*\])?\s*[\])]\s*(?:\[?\d{3,4}p|\(?\d{3,4}p|$)/i, // "Frieren - 05 (1080p)"
  /\s-\s(\d{1,4})\s*(?:\(|\[|$)/i, // "One Piece - 1176 (1080p)"
];

/**
 * Extrae temporada/episodio/capítulo de un nombre de release.
 * @returns {{ season: number|null, episode: number|null, isPack: boolean }}
 */
function parseSeasonEpisode(text) {
  const source = String(text || '');

  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = source.match(pattern.re);
    if (match) {
      const season = Number(match[pattern.season]);
      const episode = Number(match[pattern.episode]);
      if (Number.isInteger(season) && Number.isInteger(episode)) {
        return { season, episode, isPack: false };
      }
    }
  }

  // "Temporada 1" / "1 Temporada" / "T1" sin episodio = pack de temporada completa.
  // Con lookahead: si detrás hay capítulo ("Temporada 1 Cap 2") no es un pack.
  const seasonOnly = source.match(/\btemporada\s*(\d{1,2})\b(?![^|\n]{0,24}(?:cap[íi]?tulo|episodio|\bep\b|\be\s?\d))/i)
    || source.match(/\b(\d{1,2})\s*[-_. ]?\s*temporada\b(?![^|\n]{0,24}(?:cap[íi]?tulo|episodio|\bep\b|\be\s?\d))/i)
    || source.match(/\bT(\d{1,2})\b(?!\d)/);
  if (seasonOnly) {
    return { season: Number(seasonOnly[1]), episode: null, isPack: true };
  }

  const pack = source.match(PACK_PATTERN);
  if (pack) {
    if (pack[3]) return { season: Number(pack[3]), episode: null, isPack: true };
    return { season: null, episode: null, isPack: true };
  }

  const epOnly = source.match(EPISODE_ONLY_PATTERN);
  if (epOnly) return { season: null, episode: Number(epOnly[1]), isPack: false };

  for (const re of ABSOLUTE_EPISODE_PATTERNS) {
    const absolute = source.match(re);
    if (absolute) {
      const episode = Number(absolute[1]);
      if (Number.isInteger(episode) && episode > 0 && episode < 5000) {
        return { season: null, episode, isPack: false };
      }
    }
  }

  return { season: null, episode: null, isPack: false };
}

/**
 * Coincidencia difusa de títulos: "Moana 2026 WEB-DL 1080p" vs "moana" → true.
 * Quita acentos, puntuación y tokens técnicos y compara palabras clave.
 */
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((?:\d{4})\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|dv|web|dl|rip|bluray|blu|ray|bdrip|brrip|hdtv|dvdrip|remux|x26[45]|hevc|h264|aac|ac3|ddp?|5|1|2|0|10bit|esp|latino|castellano|espanol|spanish|subs?|vose|dual|latin|temp|temporada|season|completa|complete|microhd|screener|rip|mkv|mp4|avid| donated)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleTokens(title) {
  const normalized = normalizeTitle(title);
  return normalized ? normalized.split(' ').filter(token => token.length > 1) : [];
}

/**
 * ¿El release parece corresponder al título buscado?
 * Todos los tokens del título buscado deben aparecer en el release.
 */
function releaseMatchesTitle(releaseText, wantedTitle) {
  const release = normalizeTitle(releaseText);
  const wanted = titleTokens(wantedTitle);
  if (wanted.length === 0) return false;
  return wanted.every(token => release.includes(token));
}

module.exports = {
  evaluateSpanish,
  spanishLabel,
  parseSize,
  parseQuality,
  parseYear,
  parseSeasonEpisode,
  releaseMatchesTitle,
  normalizeTitle,
  titleTokens,
  SPANISH_HINTS,
  NON_SPANISH_HINTS
};
