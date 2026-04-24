const jwt = require('jsonwebtoken');
const { get } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'saas_secret_change_in_production';

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (payload.is_admin) {
    req.user = { id: 0, phone: payload.phone, name: payload.name, plan: 'admin', is_admin: true, is_active: 1 };
    return next();
  }

  const user = await get('SELECT * FROM users WHERE id = ? AND is_active = 1', [payload.userId]);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    get('SELECT * FROM users WHERE id = ? AND is_active = 1', [payload.userId])
      .then(user => { req.user = user; next(); })
      .catch(() => next());
  } catch {
    next();
  }
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
