const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Stats ────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers    = await get('SELECT COUNT(*) as count FROM users');
    const activeUsers   = await get('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const proUsers      = await get(
      "SELECT COUNT(*) as count FROM users WHERE plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > datetime('now'))"
    );
    const totalProducts = await get('SELECT COUNT(*) as count FROM products');
    res.json({
      total_users:       totalUsers?.count    || 0,
      active_users:      activeUsers?.count   || 0,
      pro_subscriptions: proUsers?.count      || 0,
      total_products:    totalProducts?.count || 0,
      monthly_revenue:   (proUsers?.count || 0) * 100,
    });
  } catch (err) {
    logger.error('Error en admin stats:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ─── Users list ───────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await all(
      `SELECT id, name, email, phone, plan, plan_expires_at, is_active,
              payment_method, payment_notes, suspended_at, created_by, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: users || [] });
  } catch (err) {
    logger.error('Error en admin users:', err.message);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ─── Create user manually ─────────────────────────────────────────────────────

// POST /api/admin/users/create
router.post('/admin/users/create', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, plan, payment_method, payment_notes, expires_at } = req.body;
    if (!email && !phone) return res.status(400).json({ error: 'Email o teléfono requerido' });

    let password_hash = null;
    if (password) password_hash = await bcrypt.hash(password, 12);

    let plan_expires_at = expires_at || null;
    if (!plan_expires_at) {
      const d = new Date();
      if (plan === 'trial')   d.setDate(d.getDate() + 7);
      else if (plan === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (plan === 'annual')  d.setFullYear(d.getFullYear() + 1);
      plan_expires_at = d.toISOString();
    }

    const now = new Date().toISOString();
    const result = await run(
      `INSERT INTO users
         (email, phone, name, password_hash, plan, plan_expires_at, payment_method, payment_notes, created_by, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1, ?)`,
      [email?.toLowerCase() || null, phone || null, name || null, password_hash,
       plan || 'trial', plan_expires_at, payment_method || null, payment_notes || null, now]
    );

    const user = await get(
      `SELECT id, name, email, phone, plan, plan_expires_at, is_active,
              payment_method, payment_notes, created_by, created_at FROM users WHERE id = ?`,
      [result.lastInsertRowid]
    );
    logger.info(`Admin creó usuario: ${email || phone}`);
    res.status(201).json({ user });
  } catch (err) {
    logger.error('Error creando usuario:', err.message);
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email o teléfono ya registrado' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// ─── Update subscription ──────────────────────────────────────────────────────

// PUT /api/admin/users/:id/subscription
router.put('/admin/users/:id/subscription', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, expires_at, payment_method, payment_notes } = req.body;

    let plan_expires_at = expires_at || null;
    if (!plan_expires_at && plan) {
      const d = new Date();
      if (plan === 'trial')        d.setDate(d.getDate() + 7);
      else if (plan === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (plan === 'annual')  d.setFullYear(d.getFullYear() + 1);
      plan_expires_at = d.toISOString();
    }

    await run(
      `UPDATE users SET plan = ?, plan_expires_at = ?, payment_method = ?,
       payment_notes = ?, is_active = 1, suspended_at = NULL WHERE id = ?`,
      [plan, plan_expires_at, payment_method || null, payment_notes || null, id]
    );
    const user = await get(
      `SELECT id, name, email, phone, plan, plan_expires_at, is_active,
              payment_method, payment_notes, suspended_at, created_at FROM users WHERE id = ?`,
      [id]
    );
    logger.info(`Admin renovó suscripción usuario ${id}: ${plan} hasta ${plan_expires_at}`);
    res.json({ user });
  } catch (err) {
    logger.error('Error actualizando suscripción:', err.message);
    res.status(500).json({ error: 'Error al actualizar suscripción' });
  }
});

// ─── Suspend / Activate / Delete ─────────────────────────────────────────────

// PUT /api/admin/users/:id/suspend
router.put('/admin/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    await run('UPDATE users SET is_active = 0, suspended_at = ? WHERE id = ?', [now, id]);
    logger.info(`Admin suspendió usuario ${id}`);
    res.json({ message: 'Usuario suspendido' });
  } catch (err) {
    res.status(500).json({ error: 'Error al suspender usuario' });
  }
});

// PUT /api/admin/users/:id/activate
router.put('/admin/users/:id/activate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await run('UPDATE users SET is_active = 1, suspended_at = NULL WHERE id = ?', [id]);
    logger.info(`Admin activó usuario ${id}`);
    res.json({ message: 'Usuario activado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al activar usuario' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM users WHERE id = ?', [id]);
    logger.info(`Admin eliminó usuario ${id}`);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

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

// ─── Config ───────────────────────────────────────────────────────────────────

// PUT /api/admin/config
router.put('/admin/config', requireAdmin, (req, res) => {
  const { trm, ml_commission, default_margin } = req.body;
  if (trm)            process.env.TRM_DEFAULT     = String(trm);
  if (ml_commission)  process.env.ML_COMMISSION   = String(ml_commission);
  if (default_margin) process.env.DEFAULT_MARGIN  = String(default_margin);
  logger.info('Admin actualizó configuración global');
  res.json({
    message:        'Configuración actualizada',
    trm:            process.env.TRM_DEFAULT,
    ml_commission:  process.env.ML_COMMISSION,
    default_margin: process.env.DEFAULT_MARGIN,
  });
});

// PUT /api/admin/users/:id (legacy — keep for backward compat)
router.put('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, plan } = req.body;
    if (is_active !== undefined) await run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    if (plan !== undefined)      await run('UPDATE users SET plan = ? WHERE id = ?', [plan, id]);
    const user = await get('SELECT id, name, email, phone, plan, is_active, created_at FROM users WHERE id = ?', [id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

module.exports = router;
