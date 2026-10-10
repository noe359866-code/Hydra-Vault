const config = require('../config');

/**
 * Extracts the token from incoming request
 */
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return authHeader.trim();
  }

  // 2. Custom header: x-admin-secret
  if (req.headers['x-admin-secret']) {
    return String(req.headers['x-admin-secret']).trim();
  }

  return null;
}

/**
 * Verifies if the candidate token matches the configured ADMIN_SECRET
 */
function verifySecret(candidateToken) {
  const expected = config.adminSecret;
  if (typeof candidateToken !== 'string' || !candidateToken || typeof expected !== 'string' || !expected) return false;
  const crypto = require('crypto');
  const candidate = Buffer.from(candidateToken.trim(), 'utf8');
  const configured = Buffer.from(expected.trim(), 'utf8');
  return candidate.length === configured.length && crypto.timingSafeEqual(candidate, configured);
}

/**
 * Express Middleware protecting routes with ADMIN_SECRET
 */
function requireAdminAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token de autenticación faltante. Proporciona ADMIN_SECRET en la cabecera Authorization: Bearer <token> o x-admin-secret.'
    });
  }

  if (!verifySecret(token)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Token ADMIN_SECRET incorrecto.'
    });
  }

  next();
}

module.exports = {
  requireAdminAuth,
  verifySecret,
  extractToken
};
