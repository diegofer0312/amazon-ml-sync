const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get, all } = require('../database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// OTP store en memoria (en prod usar Redis)
const otpStore = new Map();

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });

    const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

    const password_hash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const result = await run(
      `INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (?, ?, ?, 'trial', ?)`,
      [email.toLowerCase(), password_hash, name || email.split('@')[0], now]
    );

    const user = await get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    const token = generateToken(user.id);
    logger.info(`Nuevo usuario registrado: ${email}`);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Error en register:', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (!user.is_active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    // Cargar tokens ML del usuario en variables de entorno de sesión
    if (user.ml_access_token) process.env.ML_ACCESS_TOKEN = user.ml_access_token;
    if (user.ml_refresh_token) process.env.ML_REFRESH_TOKEN = user.ml_refresh_token;

    const token = generateToken(user.id);
    logger.info(`Login: ${email}`);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /api/auth/google — recibe id_token del frontend y lo verifica
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Token de Google requerido' });

    // Decodificar el JWT de Google (sin verificación de firma para desarrollo)
    // En producción usar google-auth-library para verificar
    const parts = credential.split('.');
    if (parts.length < 2) return res.status(400).json({ error: 'Token inválido' });
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    const { sub: google_id, email, name, picture: avatar } = payload;
    if (!email) return res.status(400).json({ error: 'No se pudo obtener el email de Google' });

    let user = await get('SELECT * FROM users WHERE google_id = ? OR email = ?', [google_id, email.toLowerCase()]);
    if (!user) {
      const now = new Date().toISOString();
      const result = await run(
        `INSERT INTO users (email, name, avatar, google_id, plan, created_at) VALUES (?, ?, ?, ?, 'trial', ?)`,
        [email.toLowerCase(), name, avatar, google_id, now]
      );
      user = await get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    } else if (!user.google_id) {
      await run('UPDATE users SET google_id = ?, avatar = ? WHERE id = ?', [google_id, avatar, user.id]);
      user = await get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    if (!user.is_active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const token = generateToken(user.id);
    logger.info(`Login Google: ${email}`);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Error en login Google:', err.message);
    res.status(500).json({ error: 'Error al autenticar con Google' });
  }
});

// POST /api/auth/facebook
router.post('/facebook', async (req, res) => {
  try {
    const { accessToken, userID } = req.body;
    if (!accessToken || !userID) return res.status(400).json({ error: 'Token de Facebook requerido' });

    // Verificar token con Facebook Graph API
    const axios = require('axios');
    const { data: fbUser } = await axios.get(`https://graph.facebook.com/${userID}`, {
      params: { fields: 'id,name,email,picture', access_token: accessToken }
    });

    const { id: facebook_id, name, email, picture } = fbUser;
    const avatar = picture?.data?.url;

    let user = await get(
      'SELECT * FROM users WHERE facebook_id = ?' + (email ? ' OR email = ?' : ''),
      email ? [facebook_id, email.toLowerCase()] : [facebook_id]
    );

    if (!user) {
      const now = new Date().toISOString();
      const result = await run(
        `INSERT INTO users (email, name, avatar, facebook_id, plan, created_at) VALUES (?, ?, ?, ?, 'trial', ?)`,
        [email?.toLowerCase() || null, name, avatar, facebook_id, now]
      );
      user = await get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    }

    if (!user.is_active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const token = generateToken(user.id);
    logger.info(`Login Facebook: ${name}`);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Error en login Facebook:', err.message);
    res.status(500).json({ error: 'Error al autenticar con Facebook' });
  }
});

// POST /api/auth/phone — envía OTP por SMS
router.post('/phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Número de teléfono requerido' });

    if (phone === process.env.ADMIN_PHONE) {
      const adminUser = { id: 0, phone, name: 'Diego Admin', plan: 'admin', is_admin: true };
      const token = jwt.sign(
        { userId: 0, is_admin: true, phone, name: 'Diego Admin', plan: 'admin' },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      logger.info(`Admin login: ${phone}`);
      return res.json({ success: true, token, user: adminUser });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(phone, { otp, expires: Date.now() + 10 * 60 * 1000 });

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `Tu código de verificación es: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    } else {
      logger.warn(`OTP para ${phone}: ${otp} (Twilio no configurado)`);
    }

    res.json({ message: 'Código enviado', phone });
  } catch (err) {
    logger.error('Error enviando OTP:', err.message);
    res.status(500).json({ error: 'Error al enviar el código SMS' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Teléfono y OTP requeridos' });

    const stored = otpStore.get(phone);
    if (!stored) return res.status(400).json({ error: 'Código no enviado o expirado' });
    if (Date.now() > stored.expires) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'Código expirado' });
    }
    if (stored.otp !== otp) return res.status(400).json({ error: 'Código incorrecto' });

    otpStore.delete(phone);

    let user = await get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) {
      const now = new Date().toISOString();
      const result = await run(
        `INSERT INTO users (phone, plan, created_at) VALUES (?, 'trial', ?)`,
        [phone, now]
      );
      user = await get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    }

    if (!user.is_active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const token = generateToken(user.id);
    logger.info(`Login Phone: ${phone}`);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error('Error verificando OTP:', err.message);
    res.status(500).json({ error: 'Error al verificar el código' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  if (req.user.is_admin) {
    return res.json({
      user: {
        id: 0,
        name: req.user.name || 'Diego Admin',
        phone: req.user.phone || process.env.ADMIN_PHONE,
        plan: 'admin',
        is_admin: true,
        is_active: true,
      }
    });
  }
  res.json({ user: sanitizeUser(req.user) });
});

// PUT /api/auth/me — actualizar perfil
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    await run('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, req.user.id]);
    const updated = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Sesión cerrada' });
});

module.exports = router;
