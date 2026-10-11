/**
 * Utilidades de presentación para el catálogo y la ficha de Stremio.
 */

// Marcas de temporada/episodio/capítulo donde termina el nombre de la serie.
const EPISODE_MARKER = /(?:\bS\d{1,2}(?:\s*E\d{1,4})?\b|\b\d{1,2}x\d{1,4}\b|\b(?:temporada|season|cap(?:[ií]tulo)?|ep(?:isodio|isode)?)\.?\s*\d+|\s-\s\d{1,4}(?:v\d)?(?=\s|$|[\[(]))/i;
// Etiquetas técnicas donde termina el nombre de cualquier release.
const TECH_MARKER = /\b(?:2160p|1080p|720p|480p|4k|uhd|remux|web-?dl|web-?rip|bluray|blu-ray|bdrip|hdtv|x26[45]|hevc|completa|complete)\b/i;

/**
 * "The Glory (La Gloria) S01E03 1080p Viki" -> "The Glory (La Gloria)"
 * "[SubsPlease] Frieren - 05 (1080p)"      -> "Frieren"
 * "Parasite 2019 4K Remux"                  -> "Parasite 2019"
 */
function cleanShowName(title, type) {
  const original = String(title || '').trim();
  let name = original.replace(/^\s*(?:\[[^\]]*\]\s*)+/, '');

  const cut = (regex) => {
    const match = name.match(regex);
    if (match && match.index > 0) name = name.slice(0, match.index);
  };

  if (type !== 'movie') cut(EPISODE_MARKER);
  cut(TECH_MARKER);

  name = name.replace(/[\s\-–—|:.,_[(]+$/, '').replace(/[._]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return name.length >= 2 ? name : original;
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
}

/**
 * Póster SVG ligero para títulos sin IMDb.
 */
function createFallbackPoster(title, platform, quality) {
  const cleanTitle = (title || 'Hydra').substring(0, 28);
  const color = platform === 'Viki' ? '#8b5cf6' : (platform === 'iQiyi' ? '#10b981' : '#3b82f6');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" rx="12" fill="#0f172a"/><circle cx="150" cy="140" r="50" fill="${color}" fill-opacity=".2"/><text x="150" y="148" font-family="system-ui,sans-serif" font-weight="bold" font-size="28" fill="${color}" text-anchor="middle">HYDRA</text><text x="150" y="280" font-family="system-ui,sans-serif" font-weight="bold" font-size="16" fill="#f8fafc" text-anchor="middle">${escapeXml(cleanTitle)}</text><rect x="90" y="320" width="120" height="28" rx="6" fill="${color}"/><text x="150" y="339" font-family="system-ui,sans-serif" font-weight="bold" font-size="12" fill="#fff" text-anchor="middle">${escapeXml(platform || 'Vault')} • ${escapeXml(quality || '1080p')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Póster real (Metahub, el mismo que usa Cinemeta) cuando hay IMDb; si no, el SVG.
 */
function posterFor(item, name) {
  if (item.imdb_id && /^tt\d+$/.test(item.imdb_id)) {
    return `https://images.metahub.space/poster/medium/${item.imdb_id}/img`;
  }
  return createFallbackPoster(name || item.title, item.source_platform, item.quality);
}

function backgroundFor(item) {
  if (item.imdb_id && /^tt\d+$/.test(item.imdb_id)) {
    return `https://images.metahub.space/background/medium/${item.imdb_id}/img`;
  }
  return undefined;
}

module.exports = {
  cleanShowName,
  createFallbackPoster,
  posterFor,
  backgroundFor,
  escapeXml
};
