const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { get, all, run } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.is_admin) return res.status(403).json({ error: 'Acceso denegado' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// POST /api/auth/admin-login
router.post('/auth/admin-login', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Teléfono requerido' });
  if (phone !== process.env.ADMIN_PHONE) {
    return res.status(401).json({ error: 'Acceso denegado' });
  }
  const token = jwt.sign(
    { userId: 0, is_admin: true, phone, name: 'Diego Admin', plan: 'admin' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  logger.info(`Admin panel login: ${phone}`);
  res.json({
    success: true,
    token,
    user: { id: 0, phone, name: 'Diego Admin', plan: 'admin', is_admin: true },
  });
});

// GET /api/admin/stats
router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await get('SELECT COUNT(*) as count FROM users');
    const activeUsers = await get('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const proUsers = await get(
      "SELECT COUNT(*) as count FROM users WHERE plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > datetime('now'))"
    );
    const totalProducts = await get('SELECT COUNT(*) as count FROM products');
    res.json({
      total_users: totalUsers?.count || 0,
      active_users: activeUsers?.count || 0,
      pro_subscriptions: proUsers?.count || 0,
      total_products: totalProducts?.count || 0,
      monthly_revenue: (proUsers?.count || 0) * 29,
    });
  } catch (err) {
    logger.error('Error en admin stats:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// GET /api/admin/users
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await all(
      'SELECT id, name, email, phone, plan, plan_expires_at, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: users || [] });
  } catch (err) {
    logger.error('Error en admin users:', err.message);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// PUT /api/admin/users/:id
router.put('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, plan } = req.body;
    if (is_active !== undefined) {
      await run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    }
    if (plan !== undefined) {
      await run('UPDATE users SET plan = ? WHERE id = ?', [plan, id]);
    }
    const user = await get(
      'SELECT id, name, email, phone, plan, is_active, created_at FROM users WHERE id = ?',
      [id]
    );
    res.json({ user });
  } catch (err) {
    logger.error('Error actualizando usuario:', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// GET /api/admin/logs
router.get('/admin/logs', requireAdmin, (req, res) => {
  try {
    const logPath = path.join(process.cwd(), 'logs', 'combined.log');
    if (!fs.existsSync(logPath)) return res.json({ logs: [] });
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean).slice(-100).reverse();
    const logs = lines.map(line => {
      try { return JSON.parse(line); } catch { return { message: line, timestamp: '', level: 'info' }; }
    });
    res.json({ logs });
  } catch {
    res.json({ logs: [] });
  }
});

// PUT /api/admin/config
router.put('/admin/config', requireAdmin, (req, res) => {
  const { trm, ml_commission, default_margin } = req.body;
  if (trm) process.env.TRM_DEFAULT = String(trm);
  if (ml_commission) process.env.ML_COMMISSION = String(ml_commission);
  if (default_margin) process.env.DEFAULT_MARGIN = String(default_margin);
  logger.info('Admin actualizó configuración global');
  res.json({
    message: 'Configuración actualizada',
    trm: process.env.TRM_DEFAULT,
    ml_commission: process.env.ML_COMMISSION,
    default_margin: process.env.DEFAULT_MARGIN,
  });
});

module.exports = router;
