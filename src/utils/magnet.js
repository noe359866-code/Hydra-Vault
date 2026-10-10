/**
 * Magnet Link Parser and Stremio Stream Formatter
 * Supports BTIH (40-char hex & 32-char Base32), trackers, direct HTTP/HTTPS URLs.
 */

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce'
];

/**
 * Converts RFC 4648 Base32 string (32 chars) to Hexadecimal string (40 chars)
 */
function base32ToHex(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) return null;
    bits += val.toString(2).padStart(5, '0');
  }
  
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substr(i, 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/**
 * Format bytes into human readable string (e.g. 1.45 GB)
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const num = parseInt(bytes, 10);
  if (num === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Parses a magnet URI or direct URL
 */
function parseMagnet(magnetStr) {
  if (!magnetStr || typeof magnetStr !== 'string') {
    return { isValid: false };
  }

  const trimmed = magnetStr.trim();

  // Handle direct HTTP/HTTPS media streams
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      isValid: true,
      isDirectUrl: true,
      url: trimmed,
      dn: trimmed.split('/').pop().split('?')[0] || 'Direct Stream'
    };
  }

  // Handle Magnet URIs
  if (trimmed.startsWith('magnet:?')) {
    const query = trimmed.slice(8);
    const params = new URLSearchParams(query);
    
    let infoHash = null;
    const xt = params.get('xt') || '';
    
    // Support urn:btih:<hash>
    const match = xt.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (match) {
      const rawHash = match[1];
      if (rawHash.length === 40) {
        infoHash = rawHash.toLowerCase();
      } else if (rawHash.length === 32) {
        const converted = base32ToHex(rawHash);
        if (converted && converted.length === 40) {
          infoHash = converted.toLowerCase();
        }
      }
    }

    // Display Name
    const dn = params.get('dn') ? decodeURIComponent(params.get('dn')).replace(/\+/g, ' ') : '';
    
    // Trackers
    const trList = params.getAll('tr').map(t => decodeURIComponent(t));
    const combinedTrackers = Array.from(new Set([...trList, ...DEFAULT_TRACKERS]));
    const sources = combinedTrackers.map(tr => tr.startsWith('tracker:') ? tr : `tracker:${tr}`);
    
    // File Index if specified (so=0 or fileIdx=0)
    let fileIdx = null;
    if (params.has('so')) {
      const parsedSo = parseInt(params.get('so'), 10);
      if (!isNaN(parsedSo)) fileIdx = parsedSo;
    } else if (params.has('fileIdx')) {
      const parsedIdx = parseInt(params.get('fileIdx'), 10);
      if (!isNaN(parsedIdx)) fileIdx = parsedIdx;
    }

    // Exact length in bytes if specified (xl=...)
    let parsedSize = null;
    if (params.has('xl')) {
      parsedSize = formatBytes(params.get('xl'));
    }

    return {
      isValid: Boolean(infoHash),
      isDirectUrl: false,
      infoHash,
      dn,
      trackers: combinedTrackers,
      sources,
      fileIdx,
      suggestedSize: parsedSize
    };
  }

  // If someone passed bare infoHash (40 hex chars)
  if (/^[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      isValid: true,
      isDirectUrl: false,
      infoHash: trimmed.toLowerCase(),
      trackers: DEFAULT_TRACKERS,
      sources: DEFAULT_TRACKERS.map(tr => `tracker:${tr}`)
    };
  }

  return { isValid: false };
}

/**
 * Transforms a hydra_vault database row into a Stremio v3 Stream object
 */
function formatStremioStream(entry) {
  const parsed = parseMagnet(entry.magnet);
  
  // Clean badges for the header
  const quality = entry.quality || '1080p';
  const platform = entry.source_platform || 'Vault';
  const audio = entry.audio_lang || 'Multi';
  const subtitles = entry.subtitles || 'Multi';
  const size = entry.size && entry.size !== 'N/D' ? entry.size : (parsed.suggestedSize || 'N/D');
  const seeders = Number.isInteger(entry.seeders) ? entry.seeders : 10;

  // Stream Title shown in Stremio stream selection list
  const titleLines = [];
  titleLines.push(entry.title || parsed.dn || 'Hydra Release');
  
  const techDetails = [];
  if (seeders !== null && seeders !== undefined) techDetails.push(`⚡ ${seeders} seeds`);
  if (size && size !== 'N/D') techDetails.push(`💾 ${size}`);
  if (audio) techDetails.push(`🌐 ${audio}`);
  if (subtitles) techDetails.push(`💬 Subs: ${subtitles}`);
  if (platform) techDetails.push(`🏷️ ${platform}`);
  
  if (techDetails.length > 0) {
    titleLines.push(techDetails.join(' | '));
  }
  
  titleLines.push(`🔒 Hydra Vault • Curated Stream`);

  const stream = {
    name: `[Hydra] ${quality}\n${platform}`,
    title: titleLines.join('\n'),
    behaviorHints: {
      bingeGroup: `hydra-${quality}-${platform.toLowerCase().replace(/\s+/g, '-')}`
    }
  };

  if (parsed.isDirectUrl) {
    stream.name = `[Hydra Direct] ${quality}\n${platform}`;
    stream.url = entry.magnet;
  } else if (parsed.infoHash) {
    stream.infoHash = parsed.infoHash;
    if (parsed.sources && parsed.sources.length > 0) {
      stream.sources = parsed.sources;
    }
    if (parsed.fileIdx !== null && parsed.fileIdx !== undefined) {
      stream.fileIdx = parsed.fileIdx;
    }
  } else {
    // If not standard torrent hash, pass externalUrl fallback
    stream.externalUrl = entry.magnet;
  }

  return stream;
}

module.exports = {
  parseMagnet,
  formatStremioStream,
  base32ToHex,
  DEFAULT_TRACKERS
};
