/**
 * PoW (Proof of Work) para los sitios con motor DonTorrent
 * (dontorrent.* y mejortorrent.*): el endpoint de descarga protegida
 * exige resolver un hash SHA-256 con N ceros iniciales.
 *
 * Flujo (observado en el sitio):
 *  1) POST /api_validate_pow.php  { action: "generate", content_id, tabla }
 *     -> { success, challenge }
 *  2) resolver sha256(challenge + nonce) hasta encontrar `difficulty` ceros iniciales
 *     (dificultad 3 por defecto, "000").
 *  3) POST /api_validate_pow.php  { action: "validate", challenge, nonce }
 *     -> { success, download_url }
 */

const crypto = require('crypto');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * Resuelve el PoW: sha256(challenge + nonce) con `difficulty` ceros iniciales.
 * Dificultad 3 ≈ 4096 intentos de media (instantáneo); se acota por seguridad.
 */
function solveDownloadPow(challenge, difficulty = 3, maxAttempts = 2_000_000) {
  const target = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < maxAttempts; nonce++) {
    const hashHex = sha256Hex(`${challenge}${nonce}`);
    if (hashHex.startsWith(target)) return { nonce, hashHex };
  }
  throw new Error('PoW de descarga no resuelto (dificultad demasiado alta).');
}

/**
 * Obtiene la URL directa de descarga (.torrent) para un enlace protegido.
 * @param {object} http módulo http del scraper
 * @param {string} origin p. ej. https://dontorrent.meme
 * @param {string} pageUrl URL de la ficha (Referer)
 * @param {{ contentId: string|number, tabla: string }} anchor de `a.protected-download`
 */
async function resolveProtectedDownload(http, origin, pageUrl, { contentId, tabla }) {
  const apiUrl = new URL('/api_validate_pow.php', origin).href;

  const apiHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Referer': pageUrl,
    'Origin': origin,
    'X-Requested-With': 'XMLHttpRequest'
  };

  const generateRes = await http.request(apiUrl, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ action: 'generate', content_id: parseInt(contentId, 10), tabla })
  });
  const generated = JSON.parse(generateRes.text());
  if (!generated || !generated.success || !generated.challenge) {
    throw new Error((generated && generated.error) || 'El sitio no generó el desafío de descarga.');
  }

  const difficulty = Number(generated.difficulty) || 3;
  const { nonce } = solveDownloadPow(generated.challenge, difficulty);

  const validateRes = await http.request(apiUrl, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ action: 'validate', challenge: generated.challenge, nonce })
  });
  const validated = JSON.parse(validateRes.text());
  if (validated && validated.status === 'limit_exceeded') {
    throw new Error('Límite de descargas del sitio alcanzado; reintenta más tarde.');
  }
  if (!validated || !validated.success || !validated.download_url) {
    throw new Error((validated && validated.error) || 'El sitio no devolvió el enlace de descarga.');
  }

  let downloadUrl = validated.download_url;
  if (downloadUrl.startsWith('//')) downloadUrl = `https:${downloadUrl}`;
  if (!/^https?:\/\//i.test(downloadUrl)) {
    downloadUrl = new URL(downloadUrl, origin).href;
  }
  return downloadUrl;
}

module.exports = { sha256Hex, solveDownloadPow, resolveProtectedDownload };
