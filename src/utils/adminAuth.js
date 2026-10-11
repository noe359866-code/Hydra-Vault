/**
 * Comparación en tiempo constante del secreto de administración (x-admin-secret).
 * Compartida por los endpoints de /api/admin/*.
 */
const crypto = require('crypto');

function matchesSecret(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || !candidate || !expected) {
    return false;
  }
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return candidateBytes.length === expectedBytes.length && crypto.timingSafeEqual(candidateBytes, expectedBytes);
}

module.exports = { matchesSecret };
