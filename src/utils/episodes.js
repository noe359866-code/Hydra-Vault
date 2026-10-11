/**
 * Reglas compartidas de temporadas, episodios y capítulos.
 *
 * - movie:          sin temporada ni episodio.
 * - series / drama: temporada + episodio (S01E03).
 * - anime:          capítulo (numeración absoluta o de la temporada). La temporada es opcional;
 *                   si se omite se considera temporada 1 para IDs de IMDb/TMDb.
 */

const EPISODIC_TYPES = new Set(['series', 'drama', 'anime']);
// Prefijos que Stremio usa con un único número de episodio: kitsu:ID:EP / anilist:ID:EP / mal:ID:EP
const ABSOLUTE_EPISODE_PREFIXES = new Set(['kitsu', 'anilist', 'mal']);
const NAMESPACED_PREFIXES = new Set(['kitsu', 'anilist', 'mal', 'tmdb', 'hydra']);

function isEpisodicType(type) {
  return EPISODIC_TYPES.has(String(type || '').toLowerCase());
}

function toOptionalInt(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

/**
 * Normaliza y valida temporada/episodio según el tipo.
 * strict = true exige los campos (formulario de administración);
 * strict = false permite packs sin episodio (datos semilla / registros antiguos).
 * Devuelve { season, episode } o lanza Error con un mensaje en español.
 */
function normalizeEpisodeFields(type, rawSeason, rawEpisode, { strict = false } = {}) {
  const kind = String(type || '').toLowerCase();

  if (!isEpisodicType(kind)) {
    // Las películas nunca llevan temporada/episodio.
    return { season: null, episode: null };
  }

  const season = toOptionalInt(rawSeason);
  const episode = toOptionalInt(rawEpisode);

  if (season !== null && (!Number.isInteger(season) || season < 0)) {
    throw new Error('La temporada debe ser un entero mayor o igual a cero.');
  }
  if (episode !== null && (!Number.isInteger(episode) || episode < 1)) {
    throw new Error(kind === 'anime'
      ? 'El capítulo debe ser un entero mayor o igual a uno.'
      : 'El episodio debe ser un entero mayor o igual a uno.');
  }

  if (kind === 'anime') {
    if (season !== null && episode === null) {
      throw new Error('Para anime indica el número de capítulo.');
    }
    if (strict && episode === null) {
      throw new Error('Para anime indica el número de capítulo.');
    }
    return { season, episode };
  }

  // series / drama
  if ((season === null) !== (episode === null)) {
    throw new Error('Para series y dramas indica temporada y episodio juntos.');
  }
  if (strict && season === null) {
    throw new Error('Para series y dramas indica temporada y episodio.');
  }
  return { season, episode };
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || !/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Interpreta un ID de Stremio:
 *   tt123              -> { baseId: 'tt123' }
 *   tt123:1:3          -> { baseId: 'tt123', season: 1, episode: 3 }
 *   tmdb:55:2:4        -> { baseId: '55', season: 2, episode: 4 }
 *   kitsu:46474:12     -> { baseId: '46474', episode: 12, absolute: true }
 *   anilist:154587:12  -> { baseId: '154587', episode: 12, absolute: true }
 *   hydra:7:1:3        -> { baseId: '7', numericId: 7, season: 1, episode: 3 }
 *   mi-custom-id:1:3   -> { baseId: 'mi-custom-id', season: 1, episode: 3 }
 */
function parseStremioId(id) {
  const rawId = String(id || '').trim();
  const parts = rawId.split(':');
  const prefix = parts[0].toLowerCase();
  const result = { rawId, prefix: null, baseId: rawId, season: null, episode: null, absolute: false, numericId: null };

  if (ABSOLUTE_EPISODE_PREFIXES.has(prefix)) {
    result.prefix = prefix;
    result.baseId = parts[1] || '';
    result.absolute = true;
    if (parts.length >= 4) {
      // Formato poco común kitsu:ID:S:E
      result.season = parseIntOrNull(parts[2]);
      result.episode = parseIntOrNull(parts[3]);
      result.absolute = false;
    } else if (parts.length === 3) {
      result.episode = parseIntOrNull(parts[2]);
    }
  } else if (NAMESPACED_PREFIXES.has(prefix)) {
    result.prefix = prefix;
    result.baseId = parts[1] || '';
    if (parts.length >= 4) {
      result.season = parseIntOrNull(parts[2]);
      result.episode = parseIntOrNull(parts[3]);
    } else if (parts.length === 3) {
      result.episode = parseIntOrNull(parts[2]);
      result.absolute = true;
    }
    if (prefix === 'hydra') result.numericId = parseIntOrNull(result.baseId);
  } else {
    // tt..., IDs personalizados o IDs numéricos
    const seasonPart = parts.length >= 3 ? parseIntOrNull(parts[parts.length - 2]) : null;
    const episodePart = parts.length >= 3 ? parseIntOrNull(parts[parts.length - 1]) : null;
    if (seasonPart !== null && episodePart !== null) {
      result.baseId = parts.slice(0, -2).join(':');
      result.season = seasonPart;
      result.episode = episodePart;
    }
    if (/^tt\d+$/i.test(result.baseId)) result.prefix = 'tt';
    else if (/^\d+$/.test(result.baseId)) result.numericId = parseIntOrNull(result.baseId);
  }

  if (result.numericId !== null && result.numericId > 2147483647) result.numericId = null;
  if (result.episode === null) result.season = null;
  return result;
}

/**
 * ¿Coincide la fila guardada con el episodio pedido por Stremio?
 * Devuelve 'exact' | 'pack' | null.
 *   exact -> la fila es justo ese episodio/capítulo.
 *   pack  -> la fila es un pack sin episodio (temporada o serie completa) que puede contenerlo.
 */
function matchEpisode(row, request) {
  const rowSeason = row.season === null || row.season === undefined ? null : Number(row.season);
  const rowEpisode = row.episode === null || row.episode === undefined ? null : Number(row.episode);

  if (rowEpisode === null) {
    // Pack de temporada (season sin episode) solo sirve para esa temporada.
    if (rowSeason !== null && request.season !== null && !request.absolute && rowSeason !== request.season) return null;
    return 'pack';
  }

  if (rowEpisode !== request.episode) return null;

  // IDs de Kitsu/AniList: cada temporada es su propio ID, solo cuenta el capítulo.
  if (request.absolute || request.season === null) return 'exact';

  // IMDb/TMDb: la temporada debe coincidir. Anime sin temporada guardada = temporada 1.
  const effectiveSeason = rowSeason === null ? 1 : rowSeason;
  return effectiveSeason === request.season ? 'exact' : null;
}

/**
 * Filtra las filas para un episodio concreto: primero los episodios exactos,
 * luego los packs (temporada/serie completa). Nunca devuelve episodios distintos al pedido.
 */
function filterRowsForEpisode(rows, request) {
  if (request.episode === null) return rows;
  const exact = [];
  const packs = [];
  for (const row of rows) {
    const match = matchEpisode(row, request);
    if (match === 'exact') exact.push(row);
    else if (match === 'pack') packs.push(row);
  }
  return [...exact, ...packs];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Etiqueta legible: "T1 · E03" para series/dramas, "Cap. 12" (o "T2 · Cap. 12") para anime.
 */
function formatEpisodeLabel(row) {
  const episode = row.episode === null || row.episode === undefined ? null : Number(row.episode);
  const season = row.season === null || row.season === undefined ? null : Number(row.season);
  const kind = String(row.type || '').toLowerCase();

  if (episode === null) {
    if (season !== null && isEpisodicType(kind)) return `Temporada ${season} completa`;
    return null;
  }
  if (kind === 'anime') {
    return season !== null ? `T${season} · Cap. ${pad2(episode)}` : `Cap. ${pad2(episode)}`;
  }
  return `T${season ?? 1} · E${pad2(episode)}`;
}

module.exports = {
  EPISODIC_TYPES,
  isEpisodicType,
  normalizeEpisodeFields,
  parseStremioId,
  matchEpisode,
  filterRowsForEpisode,
  formatEpisodeLabel
};
