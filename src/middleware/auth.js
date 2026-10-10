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

  // 3. Query params: ?secret=... or ?token=...
  if (req.query && (req.query.secret || req.query.token)) {
    return String(req.query.secret || req.query.token).trim();
  }

  // 4. Cookie: admin_secret=...
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [key, val] = c.trim().split('=');
      if (key === 'admin_secret') {
        return decodeURIComponent(val);
      }
    }
  }

  return null;
}

/**
 * Verifies if the candidate token matches the configured ADMIN_SECRET
 */
function verifySecret(candidateToken) {
  if (!candidateToken || typeof candidateToken !== 'string') return false;
  return candidateToken.trim() === config.adminSecret.trim();
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
