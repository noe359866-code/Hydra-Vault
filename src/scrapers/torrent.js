/**
 * Conversión de .torrent → magnet y construcción de magnets a partir del hash.
 */

const crypto = require('crypto');
const { locateInfoDict } = require('./bencode');

const FALLBACK_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.openbittorrent.com:80/announce'
];

/**
 * Extrae { infoHash, name, length, trackers } de los bytes de un .torrent.
 */
function parseTorrentBuffer(buffer) {
  const [start, end] = locateInfoDict(buffer);
  const infoHash = crypto.createHash('sha1').update(buffer.subarray(start, end)).digest('hex');

  // Re-decodifica el diccionario completo para sacar nombre y trackers.
  // eslint-disable-next-line no-unused-vars
  const [dict] = require('./bencode').decode(buffer, 0, buffer.length);
  const info = dict && typeof dict === 'object' ? dict.info : null;
  const name = (info && (info['name.utf-8'] || info.name)) || null;
  const length = (info && (info.length || (Array.isArray(info.files)
    ? info.files.reduce((acc, f) => acc + (f.length || 0), 0)
    : null))) || null;
  const announceList = [];
  if (typeof dict.announce === 'string') announceList.push(dict.announce);
  if (Array.isArray(dict['announce-list'])) {
    for (const tier of dict['announce-list']) {
      if (Array.isArray(tier)) announceList.push(...tier.filter(t => typeof t === 'string'));
      else if (typeof tier === 'string') announceList.push(tier);
    }
  }
  return { infoHash, name, length, trackers: [...new Set(announceList)] };
}

/** magnet:?xt=urn:btih:<hash>&dn=<nombre>&tr=<trackers...> */
function buildMagnet(infoHash, name = null, trackers = []) {
  const parts = [`xt=urn:btih:${String(infoHash).toLowerCase()}`];
  if (name) parts.push(`dn=${encodeURIComponent(name)}`);
  const allTrackers = [...new Set([...trackers, ...FALLBACK_TRACKERS])];
  for (const tracker of allTrackers) parts.push(`tr=${encodeURIComponent(tracker)}`);
  return `magnet:?${parts.join('&')}`;
}

/**
 * Descarga un .torrent (buffer) y devuelve su magnet.
 * Soporta además enlaces a servicios públicos de metainfo cuando el .torrent
 * original falla (itorrents.org usa el propio infohash... que aún no conocemos),
 * así que solo soporta descargas directas.
 */
async function torrentUrlToMagnet(url, http) {
  const buffer = await http.getBuffer(url, {
    headers: { Accept: 'application/x-bittorrent,application/octet-stream,*/*' }
  });
  if (buffer.length < 10) throw new Error('.torrent vacío');
  if (buffer[0] !== 0x64) {
    // HTML u otro contenido: probablemente protección anti-bot.
    const head = buffer.toString('utf8', 0, 200);
    throw new Error(`La descarga no devolvió un .torrent válido (${head.replace(/\s+/g, ' ').slice(0, 80)}…`);
  }
  const parsed = parseTorrentBuffer(buffer);
  return { ...parsed, magnet: buildMagnet(parsed.infoHash, parsed.name, parsed.trackers) };
}

module.exports = {
  parseTorrentBuffer,
  buildMagnet,
  torrentUrlToMagnet,
  FALLBACK_TRACKERS
};
