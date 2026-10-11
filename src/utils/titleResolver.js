/**
 * External Title Resolver (Kitsu / AniList)
 * Cuando el stream id de Stremio es kitsu:... o anilist:..., Prowlarr no entiende
 * ese identificador: resolvemos el título canónico y buscamos por texto.
 * Todos los fetch son inyectables para pruebas y fallan en silencio (→ null).
 */

const KITSU_URL = 'https://kitsu.io/api/edge/anime/';
const ANILIST_URL = 'https://graphql.anilist.co';

const ANILIST_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      title { romaji english }
    }
  }
`;

// Cache en memoria (incluye resultados negativos) para no repetir llamadas externas
const titleCache = new Map();

function withTimeout(promise, ms, onAbort) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (onAbort) onAbort();
      reject(new Error(`title resolver timeout after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchKitsu(externalId, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  try {
    const res = await withTimeout(
      fetchImpl(`${KITSU_URL}${encodeURIComponent(externalId)}`, {
        headers: { 'Accept': 'application/vnd.api+json' },
        signal: controller.signal
      }),
      timeoutMs,
      () => controller.abort()
    );
    if (!res.ok) return null;
    const json = await res.json();
    const attrs = json && json.data && json.data.attributes;
    if (!attrs) return null;
    return attrs.canonicalTitle
      || (attrs.titles && (attrs.titles.en_us || attrs.titles.en_jp || attrs.titles.ja_jp))
      || null;
  } finally {
    controller.abort();
  }
}

async function fetchAniList(externalId, fetchImpl, timeoutMs) {
  const numericId = parseInt(externalId, 10);
  if (isNaN(numericId)) return null;
  const controller = new AbortController();
  const res = await withTimeout(
    fetchImpl(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { id: numericId } }),
      signal: controller.signal
    }),
    timeoutMs,
    () => controller.abort()
  );
  if (!res.ok) return null;
  const json = await res.json();
  const title = json && json.data && json.data.Media && json.data.Media.title;
  if (!title) return null;
  return title.english || title.romaji || null;
}
/**
 * Resolve a canonical title for an external anime id.
 * @param {{ kind: 'kitsu'|'anilist', externalId: string }} target
 * @param {{ fetchImpl?: Function, timeoutMs?: number, useCache?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
async function resolveExternalTitle(target, opts = {}) {
  const kind = target && target.kind;
  const externalId = target && target.externalId;
  if (!kind || !externalId) return null;

  const fetchImpl = opts.fetchImpl || global.fetch;
  const timeoutMs = opts.timeoutMs || 3000;
  const useCache = opts.useCache !== false;
  const cacheKey = `${kind}:${externalId}`;

  if (useCache && titleCache.has(cacheKey)) {
    return titleCache.get(cacheKey);
  }

  let title = null;
  try {
    if (kind === 'kitsu') {
      title = await fetchKitsu(externalId, fetchImpl, timeoutMs);
    } else if (kind === 'anilist') {
      title = await fetchAniList(externalId, fetchImpl, timeoutMs);
    }
  } catch (err) {
    title = null;
  }

  if (title) title = String(title).trim() || null;
  if (useCache) titleCache.set(cacheKey, title);
  return title;
}

function clearTitleCache() {
  titleCache.clear();
}

module.exports = {
  resolveExternalTitle,
  clearTitleCache
};
