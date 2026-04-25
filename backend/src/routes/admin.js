const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { get, all, run } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const logger = require('../utils/logger');
const { ALL_PRODUCTS } = require('../data/catalog-products');

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

// POST /api/admin/seed-catalog
router.post('/admin/seed-catalog', requireAdmin, async (req, res) => {
  const PRODUCTS = ALL_PRODUCTS;
  const _LEGACY = [
    { asin:'B07DNJZQMX', category:'Licuadoras', brand:'Ninja', title:'Ninja BL610 Licuadora Profesional 1000W', price_usd:69.99, rating:4.7, description:'Licuadora profesional con 72 oz de capacidad, auto-iQ y cuchillas de acero inoxidable.', features:['1000 vatios de potencia','Capacidad 72 oz','Cuchillas de acero inoxidable','Función Auto-iQ'], images:['https://m.media-amazon.com/images/I/71B7I5BBTIL._AC_SL1500_.jpg'] },
    { asin:'B084ZKF3G9', category:'Licuadoras', brand:'NutriBullet', title:'NutriBullet NBR-0601 Licuadora Personal 600W', price_usd:49.99, rating:4.6, description:'Licuadora personal compacta ideal para smoothies y batidos proteicos.', features:['600 vatios','Vaso de 24 oz','Sin BPA','Fácil de limpiar'], images:['https://m.media-amazon.com/images/I/61g8TKQRJPL._AC_SL1500_.jpg'] },
    { asin:'B01MXJUIMF', category:'Licuadoras', brand:'Oster', title:'Oster Pro 1200 Licuadora con Procesador', price_usd:59.95, rating:4.5, description:'Licuadora Oster con motor de 1200 vatios y 7 velocidades para resultados perfectos.', features:['1200 vatios','7 velocidades','Vaso de vidrio 6 cups','Función Reverse'], images:['https://m.media-amazon.com/images/I/81ZI7CJHQFL._AC_SL1500_.jpg'] },
    { asin:'B08D6S85LB', category:'Licuadoras', brand:'Hamilton Beach', title:'Hamilton Beach Wave Station Licuadora 700W', price_usd:39.99, rating:4.3, description:'Licuadora con tecnología Wave Action para mezclas más suaves y sin grumos.', features:['700 vatios','Wave Action System','2 velocidades + Pulse','Capacidad 48 oz'], images:['https://m.media-amazon.com/images/I/71YTuZT0-pL._AC_SL1500_.jpg'] },
    { asin:'B08MFPNNLH', category:'Licuadoras', brand:'Vitamix', title:'Vitamix E310 Explorian Licuadora Profesional', price_usd:299.99, rating:4.8, description:'Licuadora profesional Vitamix con motor de 2.0 HP y 10 velocidades.', features:['Motor 2.0 HP','10 velocidades','Vaso de 48 oz','Garantía 5 años'], images:['https://m.media-amazon.com/images/I/71aNXBwOnHL._AC_SL1500_.jpg'] },
    { asin:'B0BCYRXHKY', category:'Licuadoras', brand:'Ninja', title:'Ninja SS101 Foodi Power Nutri Duo', price_usd:119.99, rating:4.5, description:'Sistema 2 en 1 con licuadora de alto rendimiento y procesador personal.', features:['1200 vatios pico','Extractor de nutrientes','2 vasos incluidos','Tecnología XL'], images:['https://m.media-amazon.com/images/I/71L7Iw6bKrL._AC_SL1500_.jpg'] },
    { asin:'B0CJM5LY6H', category:'Licuadoras', brand:'Cuisinart', title:'Cuisinart CBT-2000 Hurricane Pro Licuadora', price_usd:149.95, rating:4.6, description:'Licuadora de alto rendimiento con motor de 3.5 HP y vaso de 60 oz.', features:['Motor 3.5 HP','Vaso Tritan 60 oz','Programa automático smoothie','Panel táctil LED'], images:['https://m.media-amazon.com/images/I/71LB+J6J9ML._AC_SL1500_.jpg'] },
    { asin:'B09G3RDGLQ', category:'Licuadoras', brand:'Magic Bullet', title:'Magic Bullet MBR-1701 17 Piezas Sistema Nutrición', price_usd:29.99, rating:4.4, description:'Sistema completo de licuadora personal con 17 piezas para batidos y más.', features:['250 vatios','17 piezas incluidas','Vasos para llevar','Fácil de usar'], images:['https://m.media-amazon.com/images/I/81I5WI3CZWL._AC_SL1500_.jpg'] },
    { asin:'B01M0NJXHM', category:'Licuadoras', brand:'KitchenAid', title:'KitchenAid KSB1575ER Diamond Licuadora 5 Velocidades', price_usd:89.99, rating:4.5, description:'Licuadora KitchenAid con 5 velocidades y jarra de vidrio resistente al calor.', features:['5 velocidades','Jarra vidrio 60 oz','Motor 60 Hz','Tapa con abertura'], images:['https://m.media-amazon.com/images/I/71klDTwLk0L._AC_SL1500_.jpg'] },
    { asin:'B0CNP7HDZL', category:'Licuadoras', brand:'Blendjet', title:'BlendJet 2 Licuadora Portátil Recargable USB-C', price_usd:49.95, rating:4.6, description:'Licuadora portátil recargable por USB-C perfecta para usar en cualquier lugar.', features:['Recarga USB-C','Motor potente','Capacidad 16 oz','Resistente al agua IPX5'], images:['https://m.media-amazon.com/images/I/61CHoV2Y7RL._AC_SL1500_.jpg'] },
    { asin:'B09JQ2JDKB', category:'Audífonos Bluetooth', brand:'Sony', title:'Sony WH-1000XM5 Audífonos Cancelación de Ruido', price_usd:279.99, rating:4.7, description:'Audífonos inalámbricos premium con la mejor cancelación de ruido de su clase y 30h de batería.', features:['Cancelación de ruido líder','30 horas de batería','Llamadas con 8 micrófonos','Carga rápida 3 min → 3 horas'], images:['https://m.media-amazon.com/images/I/61bK6PIYX2L._AC_SL1500_.jpg'] },
    { asin:'B09G9FYX5C', category:'Audífonos Bluetooth', brand:'Bose', title:'Bose QuietComfort 45 Audífonos Bluetooth', price_usd:229.00, rating:4.6, description:'Audífonos Bose con cancelación de ruido y modo de conciencia para escuchar el entorno.', features:['Cancelación de ruido adaptativa','22 horas de batería','Modo conciencia','Plegables'], images:['https://m.media-amazon.com/images/I/41NI7DBMRYL._AC_SL1500_.jpg'] },
    { asin:'B0C2NQ57FD', category:'Audífonos Bluetooth', brand:'Apple', title:'Apple AirPods Pro (2da Generación) con USB-C', price_usd:189.99, rating:4.7, description:'AirPods Pro con chip H2, cancelación activa de ruido y audio espacial personalizado.', features:['Chip Apple H2','Cancelación activa de ruido','Audio espacial personalizado','MagSafe / USB-C'], images:['https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg'] },
    { asin:'B07G3R9KHB', category:'Audífonos Bluetooth', brand:'JBL', title:'JBL Tune 510BT Audífonos Inalámbricos On-Ear', price_usd:39.95, rating:4.5, description:'Audífonos JBL con sonido Pure Bass y 40 horas de autonomía.', features:['40 horas de batería','JBL Pure Bass','Bluetooth 5.0','Plegable compacto'], images:['https://m.media-amazon.com/images/I/71ppMFNtTaL._AC_SL1500_.jpg'] },
    { asin:'B09XS7JWHH', category:'Audífonos Bluetooth', brand:'Samsung', title:'Samsung Galaxy Buds2 Pro Audífonos True Wireless', price_usd:149.99, rating:4.4, description:'Audífonos Samsung con sonido 360° y cancelación activa de ruido inteligente.', features:['Sonido 360°','Cancelación ruido inteligente','24 horas con estuche','IPX7 agua'], images:['https://m.media-amazon.com/images/I/51YWBbfgidL._AC_SL1500_.jpg'] },
    { asin:'B09KX7HYY3', category:'Audífonos Bluetooth', brand:'Anker', title:'Anker Soundcore Life Q30 Audífonos ANC', price_usd:55.99, rating:4.5, description:'Audífonos con cancelación de ruido activa en 3 modos y 40 horas de batería.', features:['3 modos ANC','40 horas batería','Hi-Res Audio','Plegable ergonómico'], images:['https://m.media-amazon.com/images/I/61k4eqyKFBL._AC_SL1500_.jpg'] },
    { asin:'B0BTTV5C5G', category:'Audífonos Bluetooth', brand:'Beats', title:'Beats Studio Pro Audífonos Inalámbricos ANC', price_usd:199.95, rating:4.5, description:'Audífonos Beats con cancelación de ruido, modo transparencia y 40 horas de batería.', features:['Cancelación de ruido','Modo transparencia','40 horas + carga rápida','USB-C y Lightning'], images:['https://m.media-amazon.com/images/I/71dJAm7EEKL._AC_SL1500_.jpg'] },
    { asin:'B0BWXHBPZS', category:'Audífonos Bluetooth', brand:'Jabra', title:'Jabra Evolve2 55 Audífonos UC Stereo', price_usd:379.00, rating:4.6, description:'Audífonos profesionales para trabajo remoto con 8 micrófonos y ANC avanzado.', features:['8 micrófonos','ANC avanzado','Hasta 14 horas','Certificado Microsoft Teams'], images:['https://m.media-amazon.com/images/I/61tznMrNT8L._AC_SL1500_.jpg'] },
    { asin:'B0C9NX7QR6', category:'Audífonos Bluetooth', brand:'Sennheiser', title:'Sennheiser ACCENTUM Wireless Audífonos', price_usd:99.95, rating:4.5, description:'Audífonos inalámbricos Sennheiser con 50 horas de batería y carga rápida.', features:['50 horas de batería','Carga rápida 10 min','Cancelación ruido híbrida','Bluetooth 5.2'], images:['https://m.media-amazon.com/images/I/71lxGT4DIOL._AC_SL1500_.jpg'] },
    { asin:'B0CF3WNZZZ', category:'Audífonos Bluetooth', brand:'Skullcandy', title:'Skullcandy Crusher ANC 2 Audífonos Inalámbricos', price_usd:129.99, rating:4.4, description:'Audífonos con bajos ajustables, cancelación de ruido y 50 horas de batería.', features:['Bajos ajustables','50 horas batería','Cancelación de ruido','Micrófono integrado'], images:['https://m.media-amazon.com/images/I/71w1VpF1QnL._AC_SL1500_.jpg'] },
    { asin:'B0CHX9N594', category:'Smartwatch', brand:'Apple', title:'Apple Watch Series 9 GPS 45mm Midnight', price_usd:429.00, rating:4.8, description:'Apple Watch Series 9 con chip S9, pantalla Always-On y detección de accidentes.', features:['Chip S9 SiP','Pantalla Always-On','Detección de accidentes','GPS + Siri en dispositivo'], images:['https://m.media-amazon.com/images/I/71SZoPEIR6L._AC_SL1500_.jpg'] },
    { asin:'B0CKWH9C67', category:'Smartwatch', brand:'Samsung', title:'Samsung Galaxy Watch6 Classic 47mm', price_usd:299.99, rating:4.5, description:'Smartwatch Samsung con bisel giratorio, ECG, y hasta 40 horas de batería.', features:['Bisel giratorio','ECG y presión arterial','40 horas batería','Wear OS'], images:['https://m.media-amazon.com/images/I/71KMaJcQ+fL._AC_SL1500_.jpg'] },
    { asin:'B09G3ZD9Y4', category:'Smartwatch', brand:'Garmin', title:'Garmin Forerunner 955 Solar GPS Running Watch', price_usd:499.99, rating:4.7, description:'Reloj GPS para running con carga solar, mapas TopoActive y hasta 20 días de batería.', features:['Carga solar','GPS multibanda','Hasta 20 días batería','Mapas TopoActive'], images:['https://m.media-amazon.com/images/I/71X1dNEHToL._AC_SL1500_.jpg'] },
    { asin:'B0BDJ4PGNM', category:'Smartwatch', brand:'Fitbit', title:'Fitbit Sense 2 Smartwatch Salud Avanzada', price_usd:199.95, rating:4.3, description:'Smartwatch Fitbit con sensor de estrés continuo, ECG y GPS integrado.', features:['Sensor estrés cEDA','ECG integrado','GPS integrado','6 días batería'], images:['https://m.media-amazon.com/images/I/71mHrKfr1QL._AC_SL1500_.jpg'] },
    { asin:'B07HNBV5K2', category:'Smartwatch', brand:'Amazfit', title:'Amazfit GTR 4 Smartwatch AMOLED 1.43"', price_usd:99.99, rating:4.5, description:'Smartwatch con pantalla AMOLED HD, GPS de doble banda y 14 días de batería.', features:['GPS doble banda','AMOLED 1.43"','14 días batería','150 modos deporte'], images:['https://m.media-amazon.com/images/I/71QcUP7JLSL._AC_SL1500_.jpg'] },
    { asin:'B09BMVT8B7', category:'Smartwatch', brand:'Huawei', title:'HUAWEI Watch GT 3 Pro 46mm GPS Smartwatch', price_usd:179.99, rating:4.4, description:'Smartwatch premium con diseño de titanio, ECG y 14 días de autonomía.', features:['Carcasa titanio','ECG y SpO2','14 días batería','GPS dual'], images:['https://m.media-amazon.com/images/I/61HmfI9L7jL._AC_SL1500_.jpg'] },
    { asin:'B0BWQK8HGZ', category:'Smartwatch', brand:'Fossil', title:'Fossil Gen 6 Wellness Edition Smartwatch', price_usd:199.00, rating:4.2, description:'Smartwatch Fossil con Wear OS, carga rápida y monitoreo de salud completo.', features:['Wear OS por Google','Carga rápida','SpO2 y HR','AMOLED 1.28"'], images:['https://m.media-amazon.com/images/I/61jFnUSfHlL._AC_SL1500_.jpg'] },
    { asin:'B0C4PDLPFB', category:'Smartwatch', brand:'Xiaomi', title:'Xiaomi Mi Band 8 Pro Smartwatch AMOLED 1.74"', price_usd:49.99, rating:4.4, description:'Smartwatch con pantalla AMOLED grande, monitoreo de salud y 14 días de batería.', features:['AMOLED 1.74"','14 días batería','SpO2 y HR','150+ modos deporte'], images:['https://m.media-amazon.com/images/I/61UUfAlAUVL._AC_SL1500_.jpg'] },
    { asin:'B0BC4L3GD4', category:'Smartwatch', brand:'HONOR', title:'HONOR Watch 4 Pro GPS Smartwatch 1.75"', price_usd:129.99, rating:4.3, description:'Smartwatch con pantalla AMOLED, GPS independiente y más de 100 modos deportivos.', features:['GPS independiente','100+ modos deporte','SpO2 y ECG','12 días batería'], images:['https://m.media-amazon.com/images/I/61yV5-NZWEL._AC_SL1500_.jpg'] },
    { asin:'B0CCQ2THZD', category:'Smartwatch', brand:'TicWatch', title:'TicWatch Pro 5 GPS Smartwatch Wear OS', price_usd:349.99, rating:4.5, description:'Smartwatch con doble pantalla, Wear OS 3 y hasta 80 horas de batería.', features:['Doble pantalla','Wear OS 3','80 horas batería','GPS dual frecuencia'], images:['https://m.media-amazon.com/images/I/71dvqOy8N9L._AC_SL1500_.jpg'] },
    { asin:'B08DR5DFKZ', category:'Cámara WiFi', brand:'Wyze', title:'Wyze Cam v3 Cámara Seguridad 1080p WiFi', price_usd:35.98, rating:4.5, description:'Cámara de seguridad con visión nocturna a color, resistente a la intemperie e IP65.', features:['1080p Full HD','Visión nocturna color','Resistente IP65','Detección de personas'], images:['https://m.media-amazon.com/images/I/61rZg6NKPhL._AC_SL1500_.jpg'] },
    { asin:'B08M6KBPYD', category:'Cámara WiFi', brand:'Reolink', title:'Reolink 4K PoE Cámara IP Exterior 8MP', price_usd:49.99, rating:4.6, description:'Cámara IP 4K con visión nocturna inteligente, detección de movimiento y audio bidireccional.', features:['4K 8MP UHD','Visión nocturna infrarroja','Detección movimiento','Audio bidireccional'], images:['https://m.media-amazon.com/images/I/61s3X8Z9uQL._AC_SL1500_.jpg'] },
    { asin:'B07HFD1F2G', category:'Cámara WiFi', brand:'Arlo', title:'Arlo Pro 4 Spotlight Cámara Seguridad WiFi', price_usd:149.99, rating:4.3, description:'Cámara inalámbrica 2K con foco integrado, visión nocturna a color y batería recargable.', features:['2K HDR','Foco integrado','Sin cables','Visión nocturna color'], images:['https://m.media-amazon.com/images/I/71t6tQ3DXJL._AC_SL1500_.jpg'] },
    { asin:'B09CRTH2G5', category:'Cámara WiFi', brand:'Ring', title:'Ring Indoor Cam (2da Gen) Cámara Seguridad 1080p', price_usd:59.99, rating:4.4, description:'Cámara de interior Ring con 1080p HD, visión nocturna y privacidad con obturador.', features:['1080p HD','Obturador privacidad','Detección de movimiento','Dos vías de audio'], images:['https://m.media-amazon.com/images/I/41m2JGl+UQL._AC_SL1500_.jpg'] },
    { asin:'B08NRLYBXS', category:'Cámara WiFi', brand:'Blink', title:'Blink Outdoor 4 Cámara Seguridad WiFi Batería', price_usd:79.99, rating:4.4, description:'Cámara exterior inalámbrica con 2 años de vida de batería, resistente a la intemperie.', features:['2 años de batería','1080p HD','Resistente a la intemperie','Detección de movimiento'], images:['https://m.media-amazon.com/images/I/51XUiIAVRQL._AC_SL1500_.jpg'] },
    { asin:'B0BLW3P9RC', category:'Cámara WiFi', brand:'Eufy', title:'eufy Security S340 Dual Cam 360° 4K Pan & Tilt', price_usd:99.99, rating:4.5, description:'Cámara con doble lente, cobertura 360° y resolución 4K para máxima seguridad.', features:['Doble lente','4K + 2K','360° cobertura','Color nocturno'], images:['https://m.media-amazon.com/images/I/71F4CjMRJiL._AC_SL1500_.jpg'] },
    { asin:'B0CFFMJCHS', category:'Cámara WiFi', brand:'TP-Link', title:'TP-Link Tapo C225 2K QHD Pan&Tilt Cámara WiFi', price_usd:44.99, rating:4.5, description:'Cámara Pan & Tilt con resolución 2K, detección de IA y alertas inteligentes.', features:['2K QHD','Detección IA','Pan & Tilt 360°','Almacenamiento local/nube'], images:['https://m.media-amazon.com/images/I/61wRf9oCRiL._AC_SL1500_.jpg'] },
    { asin:'B09M8CLLSD', category:'Cámara WiFi', brand:'Google', title:'Google Nest Cam (exterior o interior) Cámara WiFi', price_usd:99.99, rating:4.3, description:'Cámara Google Nest con inteligencia artificial, batería o cable y 1080p HDR.', features:['1080p HDR','Detección de personas/animales','Hasta 7 horas batería','Historia 3 horas gratis'], images:['https://m.media-amazon.com/images/I/61RqT1FCUFL._AC_SL1500_.jpg'] },
    { asin:'B09YZD9H6J', category:'Cámara WiFi', brand:'Lorex', title:'Lorex 2K WiFi Indoor Security Camera 3MP', price_usd:69.99, rating:4.3, description:'Cámara interior 3MP con detección de movimiento avanzada y almacenamiento local.', features:['3MP 2K','Pan & Tilt 355°','Detección de movimiento','Almacenamiento microSD'], images:['https://m.media-amazon.com/images/I/61b6gRFmV-L._AC_SL1500_.jpg'] },
    { asin:'B0BVBTZKYY', category:'Cámara WiFi', brand:'Imou', title:'IMOU Bullet 2 4MP Cámara Exterior WiFi', price_usd:29.99, rating:4.4, description:'Cámara exterior con detección de humanos y vehículos, luz disuasoria y sirena.', features:['4MP Full Color','Detección humanos/vehículos','Luz disuasoria','Sirena integrada'], images:['https://m.media-amazon.com/images/I/61pJ7H-y+2L._AC_SL1500_.jpg'] },
    { asin:'B07DSKFZZ9', category:'Teclado Inalámbrico', brand:'Logitech', title:'Logitech MX Keys Advanced Teclado Inalámbrico', price_usd:99.99, rating:4.6, description:'Teclado inalámbrico inteligente con retroiluminación adaptativa y escritura precisa.', features:['Retroiluminación adaptativa','Conectar 3 dispositivos','USB-C recargable','Compatible Windows/Mac'], images:['https://m.media-amazon.com/images/I/71i1635mriL._AC_SL1500_.jpg'] },
    { asin:'B09MXX52TD', category:'Teclado Inalámbrico', brand:'Apple', title:'Apple Magic Keyboard con Touch ID y Teclado Numérico', price_usd:129.00, rating:4.7, description:'Magic Keyboard con Touch ID integrado y teclado numérico para Mac y iPad.', features:['Touch ID integrado','Bluetooth y USB-C','Teclado numérico','Batería recargable'], images:['https://m.media-amazon.com/images/I/71j8TXFM98L._AC_SL1500_.jpg'] },
    { asin:'B09G9KR7TQ', category:'Teclado Inalámbrico', brand:'Microsoft', title:'Microsoft Ergonomic Wireless Keyboard 900', price_usd:49.99, rating:4.4, description:'Teclado ergonómico inalámbrico con diseño en arco para escritura más natural.', features:['Diseño ergonómico','Wireless 2.4GHz','2 años de batería','Reposamuñecas acolchado'], images:['https://m.media-amazon.com/images/I/71v3cQ5aUkL._AC_SL1500_.jpg'] },
    { asin:'B0C7GZBK2F', category:'Teclado Inalámbrico', brand:'Keychron', title:'Keychron K3 Pro QMK Wireless Mechanical Keyboard', price_usd:89.99, rating:4.7, description:'Teclado mecánico compacto con switches intercambiables en caliente y Bluetooth 5.1.', features:['Switches hot-swap','Bluetooth 5.1 + USB-C','QMK/VIA programable','RGB retroiluminado'], images:['https://m.media-amazon.com/images/I/61Q+mCizfML._AC_SL1500_.jpg'] },
    { asin:'B07S4H5JSX', category:'Teclado Inalámbrico', brand:'Corsair', title:'Corsair K63 Wireless Teclado Mecánico Gaming', price_usd:79.99, rating:4.3, description:'Teclado mecánico gaming inalámbrico compacto TKL con switches Cherry MX Red.', features:['Cherry MX Red','Bluetooth + USB','Retroiluminación LED azul','75 horas batería'], images:['https://m.media-amazon.com/images/I/71T3G9yrAzL._AC_SL1500_.jpg'] },
    { asin:'B0BZND67GQ', category:'Teclado Inalámbrico', brand:'Razer', title:'Razer BlackWidow V3 Mini HyperSpeed Teclado Gaming', price_usd:99.99, rating:4.5, description:'Teclado gaming inalámbrico compacto 65% con switches Razer Yellow de baja latencia.', features:['Razer Yellow switches','Hyperspeed Wireless','Chroma RGB','1000 horas batería'], images:['https://m.media-amazon.com/images/I/71l1rvEYQ2L._AC_SL1500_.jpg'] },
    { asin:'B0BV1TG77B', category:'Teclado Inalámbrico', brand:'Logitech', title:'Logitech K380 Multi-Device Bluetooth Keyboard', price_usd:39.99, rating:4.5, description:'Teclado Bluetooth compacto para conectar hasta 3 dispositivos simultáneamente.', features:['3 dispositivos Bluetooth','2 años de batería','Compacto y portátil','Windows/Mac/iPad/Android'], images:['https://m.media-amazon.com/images/I/71ni0kYuGQL._AC_SL1500_.jpg'] },
    { asin:'B08F7SR6R1', category:'Teclado Inalámbrico', brand:'Arteck', title:'Arteck HB030B Universal Slim Teclado Bluetooth', price_usd:19.99, rating:4.3, description:'Teclado Bluetooth slim ultradelgado con retroiluminación 7 colores y 6 meses de batería.', features:['Retroiluminación 7 colores','6 meses batería','Ultra delgado 5.8mm','Universal compatible'], images:['https://m.media-amazon.com/images/I/71qAQ3p0g9L._AC_SL1500_.jpg'] },
    { asin:'B09DQ7Q5TB', category:'Teclado Inalámbrico', brand:'Nuphy', title:'NuPhy Air75 Wireless Mechanical Keyboard', price_usd:109.99, rating:4.6, description:'Teclado mecánico inalámbrico 75% ultra delgado con switches de perfil bajo.', features:['Perfil bajo','Bluetooth 5.0 + 2.4G + USB','Hot-swap switches','RGB retroiluminado'], images:['https://m.media-amazon.com/images/I/71bh7+y1bpL._AC_SL1500_.jpg'] },
    { asin:'B08CGBSQYP', category:'Teclado Inalámbrico', brand:'Anker', title:'Anker Ultra Compact Slim Teclado Bluetooth', price_usd:22.99, rating:4.3, description:'Teclado Bluetooth compacto con batería recargable y diseño delgado.', features:['Recargable USB-C','Ultra compacto','Bluetooth 5.1','Compatible con iOS/Android/Windows'], images:['https://m.media-amazon.com/images/I/71GxjO-kKAL._AC_SL1500_.jpg'] },
    { asin:'B09KGWBQGC', category:'Silla Gamer', brand:'Secretlab', title:'Secretlab TITAN Evo 2022 Series Silla Gaming', price_usd:429.00, rating:4.7, description:'Silla gaming premium con espuma de alta densidad, reposabrazos 4D y respaldo reclinable.', features:['Espuma alta densidad','Reposabrazos 4D','Reclinable 165°','Ruedas de nylon resistentes'], images:['https://m.media-amazon.com/images/I/81sCDVuKNYL._AC_SL1500_.jpg'] },
    { asin:'B08LHTSLXX', category:'Silla Gamer', brand:'Razer', title:'Razer Iskur Gaming Chair con Soporte Lumbar', price_usd:499.99, rating:4.5, description:'Silla gaming Razer con soporte lumbar integrado ajustable y recubrimiento en cuero sintético.', features:['Soporte lumbar integrado','Cuero sintético multi-capa','Espuma fría moldeada','Reposabrazos 4D'], images:['https://m.media-amazon.com/images/I/61Ln0FGr+oL._AC_SL1500_.jpg'] },
    { asin:'B07Z6TNWNN', category:'Silla Gamer', brand:'Respawn', title:'RESPAWN 110 Racing Style Gaming Chair Reclinable', price_usd:189.99, rating:4.4, description:'Silla gaming reclinable 155° con cojines de soporte lumbar y de cabeza incluidos.', features:['Reclinable 155°','Cojín lumbar y cabeza','Reposabrazos 3D','Ruedas nylon suave'], images:['https://m.media-amazon.com/images/I/71yKmfeyJQL._AC_SL1500_.jpg'] },
    { asin:'B09VB8ZGH6', category:'Silla Gamer', brand:'Noblechairs', title:'noblechairs HERO Gaming Chair Cuero PU Negro', price_usd:399.99, rating:4.6, description:'Silla gaming noblechairs con cuero premium, soporte lumbar ajustable y hasta 150 kg.', features:['Cuero PU premium','Soporte lumbar ajustable','Hasta 150 kg','Reposabrazos 4D'], images:['https://m.media-amazon.com/images/I/71GuwEuVYWL._AC_SL1500_.jpg'] },
    { asin:'B0CDJB45XM', category:'Silla Gamer', brand:'Corsair', title:'Corsair TC100 Relaxed Gaming Chair Tela', price_usd:249.99, rating:4.3, description:'Silla gaming en tela transpirable con soporte lumbar de espuma y reclinable 180°.', features:['Tela transpirable','Reclinable 180°','Soporte lumbar espuma','Ruedas suave piso duro'], images:['https://m.media-amazon.com/images/I/61hLqHoW7SL._AC_SL1500_.jpg'] },
    { asin:'B08Y5R2H24', category:'Silla Gamer', brand:'Homall', title:'Homall Gaming Chair Racing Style Ergonómica', price_usd:139.99, rating:4.2, description:'Silla gaming económica con diseño racing, cojín lumbar y de cabeza, y reposabrazos ajustables.', features:['Cuero PU resistente','Cojines lumbar y cabeza','Reclinable 180°','Reposabrazos ajustables'], images:['https://m.media-amazon.com/images/I/81GUn6pDUWL._AC_SL1500_.jpg'] },
    { asin:'B09ZPLMZ4F', category:'Silla Gamer', brand:'Autonomous', title:'Autonomous ErgoChair Pro Silla Ergonómica', price_usd:499.00, rating:4.5, description:'Silla ergonómica con soporte lumbar inteligente, reposacabezas y respaldo de malla.', features:['Malla respirable','Soporte lumbar dinámico','Reposacabezas ajustable','5 alturas del asiento'], images:['https://m.media-amazon.com/images/I/71T6AOBZ6WL._AC_SL1500_.jpg'] },
    { asin:'B0BRNFPDTM', category:'Silla Gamer', brand:'DXRacer', title:'DXRacer Formula Series Gaming Chair OH/FJ200', price_usd:259.99, rating:4.4, description:'Silla gaming DXRacer con diseño clásico, espuma de alta densidad y reposabrazos 3D.', features:['Espuma alta densidad','Reposabrazos 3D','Cojín lumbar y cabeza','Reclinable 135°'], images:['https://m.media-amazon.com/images/I/61mJ2eF5qWL._AC_SL1500_.jpg'] },
    { asin:'B0CJD5FRHS', category:'Silla Gamer', brand:'AndaSeat', title:'AndaSeat Kaiser 3 Series Gaming Chair XL', price_usd:449.99, rating:4.6, description:'Silla gaming premium con cuero magnético, soporte lumbar magnético y reposabrazos 4D.', features:['Cuero magnético','Soporte lumbar magnético','Reposabrazos 4D XL','Hasta 180 kg'], images:['https://m.media-amazon.com/images/I/81xGnLJQHYL._AC_SL1500_.jpg'] },
    { asin:'B09H3RGY8K', category:'Silla Gamer', brand:'OFM', title:'OFM ESS Collection Racing Style Comfort Chair', price_usd:119.99, rating:4.1, description:'Silla gaming con diseño racing, soporte lumbar y altura ajustable para escritorio.', features:['Cuero vinilo','Altura ajustable','Soporte lumbar','Reposabrazos acolchado'], images:['https://m.media-amazon.com/images/I/71AkjvJSZqL._AC_SL1500_.jpg'] },
    { asin:'B08ZG1KMQS', category:'Lámpara LED', brand:'Govee', title:'Govee LED Floor Lamp RGBIC Color Changing', price_usd:79.99, rating:4.5, description:'Lámpara de pie LED con 16 millones de colores, control por app y 55 escenas de luz.', features:['16M colores RGBIC','Control app Govee','55 escenas de luz','Compatible Alexa/Google'], images:['https://m.media-amazon.com/images/I/61MFrYc9EJL._AC_SL1500_.jpg'] },
    { asin:'B09BG5BN6K', category:'Lámpara LED', brand:'BenQ', title:'BenQ ScreenBar Halo Lámpara Monitor Sin Deslumbramiento', price_usd:179.99, rating:4.6, description:'Lámpara LED para monitor con retroiluminación trasera, sin reflejos y ajuste automático.', features:['Sin reflejos en pantalla','Retroiluminación trasera','Ajuste automático brillo','USB alimentado'], images:['https://m.media-amazon.com/images/I/61mj88R1VQL._AC_SL1500_.jpg'] },
    { asin:'B07NWQM9SS', category:'Lámpara LED', brand:'Philips Hue', title:'Philips Hue White & Color Ambiance Go Portátil', price_usd:79.99, rating:4.5, description:'Lámpara LED portátil Philips Hue con 16 millones de colores y control inalámbrico.', features:['16M colores','Portátil inalámbrica','3 horas batería','Compatible Hue Bridge'], images:['https://m.media-amazon.com/images/I/61gOCNcfA3L._AC_SL1500_.jpg'] },
    { asin:'B08L4MGBNQ', category:'Lámpara LED', brand:'TaoTronics', title:'TaoTronics LED Desk Lamp TT-DL13 Lámpara Escritorio', price_usd:29.99, rating:4.5, description:'Lámpara de escritorio LED con 5 modos de color, 7 niveles de brillo y puerto USB.', features:['5 modos de color','7 niveles brillo','Puerto USB carga','Memoria automática'], images:['https://m.media-amazon.com/images/I/61Z3nVJ7i4L._AC_SL1500_.jpg'] },
    { asin:'B09YMT5ZF6', category:'Lámpara LED', brand:'Xiaomi', title:'Xiaomi Mi LED Desk Lamp 1S Lámpara Inteligente', price_usd:34.99, rating:4.6, description:'Lámpara LED inteligente con control táctil, brillo ajustable y temperatura de color.', features:['Control táctil','2700K-6500K','Brillo ajustable','App Mi Home'], images:['https://m.media-amazon.com/images/I/61HBKw8IPFL._AC_SL1500_.jpg'] },
    { asin:'B08V9P3XDX', category:'Lámpara LED', brand:'VAVA', title:'VAVA VA-DK005 Lámpara LED Escritorio Plegable', price_usd:49.99, rating:4.4, description:'Lámpara de escritorio LED sin parpadeo con 1000 lúmenes y carga inalámbrica 10W.', features:['1000 lúmenes','Sin parpadeo','Carga inalámbrica 10W','Articulación flexible'], images:['https://m.media-amazon.com/images/I/71I7j0MzaAL._AC_SL1500_.jpg'] },
    { asin:'B0BQ7TLRDP', category:'Lámpara LED', brand:'Elgato', title:'Elgato Key Light Air Panel LED Streaming', price_usd:99.99, rating:4.6, description:'Panel LED profesional para streaming y videollamadas con 1400 lúmenes y control app.', features:['1400 lúmenes','Control app y Stream Deck','Temperatura 2900-7000K','Montaje flexible'], images:['https://m.media-amazon.com/images/I/61l17bFWKiL._AC_SL1500_.jpg'] },
    { asin:'B0CFYTFXRS', category:'Lámpara LED', brand:'Nanoleaf', title:'Nanoleaf Lines Smarter Kit 9 Segmentos LED RGB', price_usd:149.99, rating:4.4, description:'Líneas LED modulares con efectos dinámicos, sincronización de pantalla y Rhythm.', features:['Módulos personalizables','Sincronización pantalla','Rhythm (responde a música)','Compatible Alexa/Google'], images:['https://m.media-amazon.com/images/I/71-NKpOPBDL._AC_SL1500_.jpg'] },
    { asin:'B0BG5NFMVP', category:'Lámpara LED', brand:'Govee', title:'Govee Neon Rope Light Gaming LED Flexible', price_usd:44.99, rating:4.4, description:'Tira neón LED flexible con control app, efectos RGBIC y compatible con Alexa.', features:['RGBIC 16M colores','Control app','Música reactiva','Compatible Alexa/Google'], images:['https://m.media-amazon.com/images/I/71-GJGKvq+L._AC_SL1500_.jpg'] },
    { asin:'B0C6TFCKLX', category:'Lámpara LED', brand:'Lepro', title:'Lepro LED Desk Lamp Monitor Light Bar USB', price_usd:19.99, rating:4.3, description:'Luz de monitor USB sin reflejos con 3 modos de color y brillo ajustable en táctil.', features:['Sin reflejos','3 modos de color','Brillo ajustable','USB powered'], images:['https://m.media-amazon.com/images/I/71yKHB9YBsL._AC_SL1500_.jpg'] },
    { asin:'B09G9JPGX6', category:'Cargador Inalámbrico', brand:'Anker', title:'Anker 3 en 1 Cargador Inalámbrico MagSafe 15W', price_usd:45.99, rating:4.6, description:'Base de carga inalámbrica 3 en 1 para iPhone, AirPods y Apple Watch con MagSafe 15W.', features:['MagSafe 15W','3 en 1','Compatible iPhone/AW/AirPods','Plegable de viaje'], images:['https://m.media-amazon.com/images/I/61gnm+uyloL._AC_SL1500_.jpg'] },
    { asin:'B0BQNSQD5Q', category:'Cargador Inalámbrico', brand:'Belkin', title:'Belkin BOOST↑CHARGE Pro MagSafe 3 en 1', price_usd:99.99, rating:4.5, description:'Cargador inalámbrico MagSafe 3 en 1 con carga simultánea hasta 15W para Apple.', features:['MagSafe certificado','15W iPhone','3W AW fast charge','Compacto vertical'], images:['https://m.media-amazon.com/images/I/71PtKjUHMML._AC_SL1500_.jpg'] },
    { asin:'B08K6Y8H1X', category:'Cargador Inalámbrico', brand:'Samsung', title:'Samsung 15W Wireless Charger Duo Pad', price_usd:49.99, rating:4.4, description:'Base de carga inalámbrica doble Samsung con 15W para Galaxy y 9W para segunda posición.', features:['15W Fast Wireless','Dos posiciones','Compatible Qi','LED indicador'], images:['https://m.media-amazon.com/images/I/51UXA3BNZML._AC_SL1500_.jpg'] },
    { asin:'B0C7JDWMPQ', category:'Cargador Inalámbrico', brand:'ESR', title:'ESR HaloLock Cargador Inalámbrico MagSafe 15W', price_usd:17.99, rating:4.5, description:'Cargador MagSafe económico certificado con imanes de alta resistencia y 15W.', features:['Certificado MagSafe','15W rápida','Imanes N52 extra fuerte','Cable USB-C incluido'], images:['https://m.media-amazon.com/images/I/61Nc6k-ydBL._AC_SL1500_.jpg'] },
    { asin:'B0C38GZZRH', category:'Cargador Inalámbrico', brand:'Spigen', title:'Spigen ArcField MagSafe Cargador Inalámbrico', price_usd:25.99, rating:4.4, description:'Cargador MagSafe Spigen con diseño plegable y cable USB-C largo incluido.', features:['MagSafe certificado','Plegable viaje','Cable 1.5m','Indicador LED'], images:['https://m.media-amazon.com/images/I/617S7L8xyoL._AC_SL1500_.jpg'] },
    { asin:'B08XCNQQP4', category:'Cargador Inalámbrico', brand:'Mophie', title:'mophie Snap+ Wireless Charging Stand MagSafe', price_usd:39.99, rating:4.3, description:'Base de carga inalámbrica MagSafe con soporte ajustable y 15W de carga rápida.', features:['15W MagSafe','Soporte ajustable','Cable USB-C 2m','Seguridad sobrecalentamiento'], images:['https://m.media-amazon.com/images/I/61EKoK5GFKL._AC_SL1500_.jpg'] },
    { asin:'B09MX5YQHM', category:'Cargador Inalámbrico', brand:'Yootech', title:'Yootech Cargador Inalámbrico 10W Qi Pad', price_usd:12.99, rating:4.4, description:'Cargador Qi económico compatible con todos los smartphones de carga inalámbrica, 10W.', features:['10W rápida','Universal Qi','Certificado Qi','Anti-sobrecalentamiento'], images:['https://m.media-amazon.com/images/I/71hPEGOE6DL._AC_SL1500_.jpg'] },
    { asin:'B0BZJB36MZ', category:'Cargador Inalámbrico', brand:'Magsafe', title:'Apple MagSafe Charger 1m USB-C 15W Original', price_usd:38.00, rating:4.6, description:'Cargador MagSafe original Apple con imanes perfectamente alineados y 15W de carga.', features:['Original Apple','15W certificado','Cable 1m','USB-C PowerDelivery'], images:['https://m.media-amazon.com/images/I/51Km3mWMFQL._AC_SL1500_.jpg'] },
    { asin:'B0B3DLCQ2C', category:'Cargador Inalámbrico', brand:'Satechi', title:'Satechi 2 en 1 MagSafe Charging Stand Plegable', price_usd:59.99, rating:4.5, description:'Base de carga 2 en 1 MagSafe y Qi plegable para iPhone y AirPods.', features:['MagSafe 15W + Qi 5W','Plegable viaje','Aluminio premium','USB-C 20W'], images:['https://m.media-amazon.com/images/I/61CgJ2PolaL._AC_SL1500_.jpg'] },
    { asin:'B0C9KXHGMJ', category:'Cargador Inalámbrico', brand:'Ugreen', title:'UGREEN 15W MagSafe Cargador Inalámbrico Stand', price_usd:22.99, rating:4.4, description:'Soporte cargador MagSafe en aluminio con 15W de carga rápida y ángulo ajustable.', features:['15W MagSafe','Aluminio premium','Ángulo ajustable','Compatible iPhone 12-15'], images:['https://m.media-amazon.com/images/I/71BKZH6VX+L._AC_SL1500_.jpg'] },
    { asin:'B09J6NYWFZ', category:'Aspiradora Portátil', brand:'Dyson', title:'Dyson V8 Aspiradora Inalámbrica Ligera 40 min', price_usd:299.99, rating:4.7, description:'Aspiradora inalámbrica Dyson V8 con 40 minutos de autonomía y filtración HEPA.', features:['Motor Dyson digital','40 min autonomía','Filtración HEPA','Convertible a de mano'], images:['https://m.media-amazon.com/images/I/71Hj2NqyeVL._AC_SL1500_.jpg'] },
    { asin:'B093JBQ5V9', category:'Aspiradora Portátil', brand:'Shark', title:'Shark IZ140 Vertex Aspiradora Inalámbrica DuoClean', price_usd:199.99, rating:4.5, description:'Aspiradora inalámbrica con doble tecnología de cepillo DuoClean y 60 minutos de batería.', features:['DuoClean tecnología','60 min autonomía','Anti-Allergen filtro','Autovaciado XL'], images:['https://m.media-amazon.com/images/I/71ynxuqOKhL._AC_SL1500_.jpg'] },
    { asin:'B0C49GJZZL', category:'Aspiradora Portátil', brand:'Bissell', title:'Bissell CleanView Slim Corded Hand Vacuum 2389', price_usd:44.99, rating:4.3, description:'Aspiradora de mano con cable de largo alcance y múltiples accesorios para limpiar en todas partes.', features:['Cable largo','Depósito 0.6L','Multisuperficie','Accesorios incluidos'], images:['https://m.media-amazon.com/images/I/71M67S17rrL._AC_SL1500_.jpg'] },
    { asin:'B08FLYJGCM', category:'Aspiradora Portátil', brand:'BLACK+DECKER', title:'BLACK+DECKER dustbuster Aspiradora de Mano 20V', price_usd:39.99, rating:4.4, description:'Aspiradora de mano inalámbrica 20V con filtro lavable y succión ciclónica.', features:['20V litio','Succión ciclónica','Filtro lavable','Diseño ergonómico'], images:['https://m.media-amazon.com/images/I/81NnJ2fAuYL._AC_SL1500_.jpg'] },
    { asin:'B09DKQ3VYH', category:'Aspiradora Portátil', brand:'Eufy', title:'eufy HomeVac H30 Infinity Aspiradora de Mano', price_usd:79.99, rating:4.5, description:'Aspiradora de mano inalámbrica con batería intercambiable y 16kPa de succión.', features:['16 kPa succión','Batería intercambiable','Filtro HEPA','Carga rápida 4h'], images:['https://m.media-amazon.com/images/I/61GsF+gvFQL._AC_SL1500_.jpg'] },
    { asin:'B0BG6TXN7B', category:'Aspiradora Portátil', brand:'Hoover', title:'Hoover ONEPWR Blade+ Cordless Stick Vacuum', price_usd:119.99, rating:4.3, description:'Aspiradora de palo inalámbrica 20V con cepillo antienredos y 40 minutos de autonomía.', features:['Anti-enredo','40 min autonomía','20V ONEPWR','Convertible de mano'], images:['https://m.media-amazon.com/images/I/81-9oS+W+kL._AC_SL1500_.jpg'] },
    { asin:'B09JDZ9SV4', category:'Aspiradora Portátil', brand:'Tineco', title:'Tineco A11 Hero Aspiradora Inalámbrica 25kPa', price_usd:169.99, rating:4.5, description:'Aspiradora inalámbrica con pantalla LED, succión de 25 kPa y 40 minutos de autonomía.', features:['25 kPa succión','Pantalla LED','40 min autonomía','HEPA filtro'], images:['https://m.media-amazon.com/images/I/81X-6IYS0dL._AC_SL1500_.jpg'] },
    { asin:'B0BKD8Y7VY', category:'Aspiradora Portátil', brand:'Dyson', title:'Dyson V15 Detect Aspiradora Inteligente Laser', price_usd:649.99, rating:4.7, description:'La aspiradora más potente de Dyson con detección laser de polvo y pantalla LCD.', features:['Detección laser','Pantalla LCD','Motor Hyperdymium','HEPA filtrado'], images:['https://m.media-amazon.com/images/I/71e-k8z-Q9L._AC_SL1500_.jpg'] },
    { asin:'B0BZ6KVJYY', category:'Aspiradora Portátil', brand:'Dreame', title:'Dreame R20 Aspiradora Inalámbrica 26000Pa', price_usd:179.99, rating:4.5, description:'Aspiradora con succión récord de 26000 Pa, autovaciado y pantalla OLED.', features:['26000 Pa succión','Pantalla OLED','Auto-limpieza','Batería 70 min'], images:['https://m.media-amazon.com/images/I/71U2bpIMcSL._AC_SL1500_.jpg'] },
    { asin:'B0CJKGGM44', category:'Aspiradora Portátil', brand:'Miele', title:'Miele Triflex HX1 Aspiradora Inalámbrica', price_usd:399.99, rating:4.6, description:'Aspiradora inalámbrica Miele con diseño 3 en 1, filtración Vortex y batería intercambiable.', features:['Sistema 3 en 1','Filtración Vortex','Batería intercambiable','60 min autonomía'], images:['https://m.media-amazon.com/images/I/71N1MVJAXBL._AC_SL1500_.jpg'] },
    { asin:'B07FDJMC9Q', category:'Freidora de Aire', brand:'Instant Vortex', title:'Instant Vortex Plus 6-en-1 Air Fryer 6 Qt', price_usd:79.99, rating:4.6, description:'Freidora de aire 6 en 1 con funciones de asar, hornear, deshidratar y más, capacidad 6Qt.', features:['6 funciones en 1','Capacidad 6 Qt','EvenCrisp tecnología','Panel táctil claro'], images:['https://m.media-amazon.com/images/I/718UVlGYfEL._AC_SL1500_.jpg'] },
    { asin:'B09TPKN8BS', category:'Freidora de Aire', brand:'Ninja', title:'Ninja DZ201 Foodi 8 Qt DualZone Air Fryer 2 canastas', price_usd:159.99, rating:4.7, description:'Freidora con 2 canastas independientes para cocinar 2 platos diferentes simultáneamente.', features:['2 canastas DualZone','8 Qt capacidad total','6 programas de cocción','Sincronización automática'], images:['https://m.media-amazon.com/images/I/71rF9XNFUGL._AC_SL1500_.jpg'] },
    { asin:'B0BWBX5HVQ', category:'Freidora de Aire', brand:'Philips', title:'Philips Essential Air Fryer HD9280/91 7 Qt XXL', price_usd:119.99, rating:4.6, description:'Freidora de aire XXL con tecnología Rapid Air y 4 programas preestablecidos, 7 Qt.', features:['Rapid Air tecnología','7 Qt XXL','Revestimiento antiadherente','Pantalla digital'], images:['https://m.media-amazon.com/images/I/71jFMhOINGL._AC_SL1500_.jpg'] },
    { asin:'B09WX7FHRS', category:'Freidora de Aire', brand:'Cosori', title:'COSORI Air Fryer 5.8 Qt Pro LE', price_usd:99.99, rating:4.6, description:'Freidora de aire con pantalla LED, 9 funciones de cocción y 58 recetas incluidas.', features:['5.8 Qt capacidad','9 funciones','Pantalla LED touch','Sin aceite ni BPA'], images:['https://m.media-amazon.com/images/I/81mAXMzwjRL._AC_SL1500_.jpg'] },
    { asin:'B0C4HWKMVK', category:'Freidora de Aire', brand:'Gourmia', title:'Gourmia GAF798 Digital Air Fryer 7 Qt', price_usd:49.99, rating:4.4, description:'Freidora de aire digital 7 Qt con 12 funciones de cocción preestablecidas y pantalla LED.', features:['7 Qt','12 funciones','FryForce 360°','Pantalla LED'], images:['https://m.media-amazon.com/images/I/81bm0BYnQML._AC_SL1500_.jpg'] },
    { asin:'B0C7KG1W5X', category:'Freidora de Aire', brand:'Chefman', title:'Chefman TurboFry Touch Air Fryer 8 Qt', price_usd:59.99, rating:4.3, description:'Freidora de aire grande 8 Qt con pantalla touch y 4 funciones de cocción preestablecidas.', features:['8 Qt extra grande','Pantalla touch','Sin BPA','4 funciones preset'], images:['https://m.media-amazon.com/images/I/71AHJsm0NkL._AC_SL1500_.jpg'] },
    { asin:'B08V46VF6C', category:'Freidora de Aire', brand:'Ultrean', title:'Ultrean Air Fryer 4.2 Qt Temporizador Digital', price_usd:39.99, rating:4.4, description:'Freidora de aire compacta 4.2 Qt con temporizador digital y control de temperatura preciso.', features:['4.2 Qt compacta','Temporizador digital','175°C-200°C','Fácil de limpiar'], images:['https://m.media-amazon.com/images/I/81jKzF1gXFL._AC_SL1500_.jpg'] },
    { asin:'B0BFLNTM52', category:'Freidora de Aire', brand:'PowerXL', title:'PowerXL Air Fryer Pro 8 Qt 8 en 1', price_usd:79.99, rating:4.3, description:'Freidora de aire 8 en 1 con ventana de vista, 8 Qt y 7 funciones de cocción digitales.', features:['8 Qt','Ventana de vista','7 funciones digital','Canasta antiadherente'], images:['https://m.media-amazon.com/images/I/71fFGd5mRML._AC_SL1500_.jpg'] },
    { asin:'B0B7BQNKCZ', category:'Freidora de Aire', brand:'Breville', title:'Breville Smart Oven Air Fryer Pro BOV900BSS', price_usd:399.99, rating:4.6, description:'Horno tostador con freidora de aire integrada, 13 funciones y espacio para pizza 13".', features:['13 funciones','Espacio 13" pizza','Super convección','Sonda temperatura'], images:['https://m.media-amazon.com/images/I/81vRVBE8GLL._AC_SL1500_.jpg'] },
    { asin:'B0C8MCWGTB', category:'Freidora de Aire', brand:'Dreo', title:'Dreo Air Fryer Max 10 Qt 230°C Chef Edition', price_usd:89.99, rating:4.5, description:'Freidora de aire con temperatura máxima 230°C, 9 funciones y pantalla LED de arco.', features:['230°C máxima','10 Qt','9 funciones','Pantalla arco LED'], images:['https://m.media-amazon.com/images/I/71fFiKe-lVL._AC_SL1500_.jpg'] },
    { asin:'B07W6JMKGD', category:'Mouse Inalámbrico', brand:'Logitech', title:'Logitech MX Master 3S Mouse Inalámbrico 8000 DPI', price_usd:99.99, rating:4.7, description:'Mouse inalámbrico premium con sensor MagSpeed 8000 DPI y scroll electromagnético.', features:['Sensor 8000 DPI','Scroll MagSpeed','USB-C recargable','Conectar 3 dispositivos'], images:['https://m.media-amazon.com/images/I/71bG7lFsLgL._AC_SL1500_.jpg'] },
    { asin:'B09GY5RPVH', category:'Mouse Inalámbrico', brand:'Apple', title:'Apple Magic Mouse Multi-Touch Surface USB-C', price_usd:79.00, rating:4.5, description:'Magic Mouse de Apple con superficie Multi-Touch y carga USB-C para Mac.', features:['Multi-Touch Surface','Bluetooth','USB-C recargable','Compatible Mac'], images:['https://m.media-amazon.com/images/I/71haQ7FPPPL._AC_SL1500_.jpg'] },
    { asin:'B07GG6ZT34', category:'Mouse Inalámbrico', brand:'Razer', title:'Razer DeathAdder V3 HyperSpeed Wireless Gaming', price_usd:79.99, rating:4.6, description:'Mouse gaming inalámbrico ergonómico con Focus X 18000 DPI y hasta 300 horas de batería.', features:['18000 DPI','300 horas batería','HyperSpeed Wireless','Diseño ergonómico'], images:['https://m.media-amazon.com/images/I/61VWTbvjLGL._AC_SL1500_.jpg'] },
    { asin:'B0BH3QLBZB', category:'Mouse Inalámbrico', brand:'SteelSeries', title:'SteelSeries Rival 650 Gaming Mouse Wireless', price_usd:79.99, rating:4.4, description:'Mouse gaming inalámbrico con sensor TrueMove3+ dual y carga rápida 10 min.', features:['Sensor dual TrueMove3+','Carga rápida 10 min','24 horas batería','Pesos ajustables'], images:['https://m.media-amazon.com/images/I/71FGiQp7QoL._AC_SL1500_.jpg'] },
    { asin:'B0C8VV4PML', category:'Mouse Inalámbrico', brand:'Logitech', title:'Logitech G Pro X Superlight 2 Wireless Gaming', price_usd:159.99, rating:4.7, description:'El mouse gaming inalámbrico más ligero de Logitech (60g) con sensor Hero 32000 DPI.', features:['60 gramos','Hero 32000 DPI','95 horas batería','LIGHTSPEED wireless'], images:['https://m.media-amazon.com/images/I/71-6I3R04DL._AC_SL1500_.jpg'] },
    { asin:'B09VGT4D4M', category:'Mouse Inalámbrico', brand:'Microsoft', title:'Microsoft Arc Mouse Inalámbrico Plegable', price_usd:59.99, rating:4.4, description:'Mouse inalámbrico Bluetooth plegable con diseño curvo y scroll táctil.', features:['Plegable plano','Scroll táctil','Bluetooth','2 años batería AA'], images:['https://m.media-amazon.com/images/I/61BJ+f6j2YL._AC_SL1500_.jpg'] },
    { asin:'B0BQ34JDLZ', category:'Mouse Inalámbrico', brand:'Anker', title:'Anker 2.4G Wireless Vertical Ergonomic Mouse', price_usd:25.99, rating:4.4, description:'Mouse vertical ergonómico inalámbrico para reducir fatiga y tensión de muñeca.', features:['Diseño vertical ergonómico','2.4G wireless','800/1200/1600 DPI','2 años batería AA'], images:['https://m.media-amazon.com/images/I/71b8KTDp5gL._AC_SL1500_.jpg'] },
    { asin:'B07Y5W88YT', category:'Mouse Inalámbrico', brand:'Corsair', title:'Corsair Dark Core RGB Pro SE Wireless Gaming', price_usd:79.99, rating:4.3, description:'Mouse gaming inalámbrico con carga inalámbrica Qi y 18000 DPI PixArt 3391.', features:['18000 DPI','Carga Qi inalámbrica','Hyperspeed wireless','Reposapulgar intercambiable'], images:['https://m.media-amazon.com/images/I/71DRFB7EtyL._AC_SL1500_.jpg'] },
    { asin:'B0CF6L5K6Q', category:'Mouse Inalámbrico', brand:'Logitech', title:'Logitech Signature M750 Wireless Mouse Silencioso', price_usd:39.99, rating:4.6, description:'Mouse silencioso inalámbrico con scroll SmartWheel y conexión Bluetooth o Logi Bolt.', features:['Silencioso -90%','SmartWheel scroll','Bluetooth o dongle','Compatible multiOS'], images:['https://m.media-amazon.com/images/I/71TN01VfmNL._AC_SL1500_.jpg'] },
    { asin:'B0CG7CHV3V', category:'Mouse Inalámbrico', brand:'Pulsar', title:'Pulsar X2H Wireless Gaming Mouse 26000 DPI', price_usd:99.99, rating:4.6, description:'Mouse gaming ultraligero 55g con sensor PAW3395 26000 DPI y latencia <1ms.', features:['55 gramos ultraligero','26000 DPI PAW3395','<1ms latencia','70 horas batería'], images:['https://m.media-amazon.com/images/I/71JxU1lllyL._AC_SL1500_.jpg'] },
    { asin:'B09B8YWXDF', category:'Parlante Bluetooth', brand:'JBL', title:'JBL Charge 5 Altavoz Bluetooth Portátil IP67', price_usd:149.95, rating:4.7, description:'Altavoz bluetooth resistente al agua IP67 con 20 horas de batería y carga de dispositivos.', features:['IP67 agua y polvo','20 horas batería','Carga dispositivos','PartyBoost dual'], images:['https://m.media-amazon.com/images/I/81T9hkPJUGL._AC_SL1500_.jpg'] },
    { asin:'B09V4NTD5Q', category:'Parlante Bluetooth', brand:'Bose', title:'Bose SoundLink Flex Bluetooth Speaker IP67', price_usd:149.00, rating:4.7, description:'Altavoz Bose resistente al agua IP67 con sonido posicional y 12 horas de autonomía.', features:['IP67','12 horas batería','Posición autónoma','PositionIQ tecnología'], images:['https://m.media-amazon.com/images/I/61QGQO9PCIL._AC_SL1500_.jpg'] },
    { asin:'B0C3KRPVBG', category:'Parlante Bluetooth', brand:'Sony', title:'Sony SRS-XB43 Extra BASS Bluetooth Speaker', price_usd:149.99, rating:4.5, description:'Altavoz bluetooth con Extra BASS, luces multicolor y 24 horas de batería resistente al agua.', features:['Extra BASS','24 horas batería','IP67','Luces multicolor LED'], images:['https://m.media-amazon.com/images/I/81mnOvg4B6L._AC_SL1500_.jpg'] },
    { asin:'B07Q6ZWMLR', category:'Parlante Bluetooth', brand:'Anker', title:'Anker Soundcore Motion X600 Spatial Audio 50W', price_usd:89.99, rating:4.5, description:'Altavoz bluetooth con sonido espacial Hi-Res Audio certificado, 50W y 12 horas de batería.', features:['50W sonido espacial','Hi-Res Audio','12 horas batería','IP67'], images:['https://m.media-amazon.com/images/I/71H3bm-BdEL._AC_SL1500_.jpg'] },
    { asin:'B0BDHWDR4Z', category:'Parlante Bluetooth', brand:'Marshall', title:'Marshall Emberton II Bluetooth Speaker', price_usd:119.99, rating:4.7, description:'Altavoz bluetooth Marshall con diseño clásico, 30 horas de batería y sonido estéreo real.', features:['30 horas batería','Sonido estéreo real','IP67','Multi-host'], images:['https://m.media-amazon.com/images/I/71X3KTJsGHL._AC_SL1500_.jpg'] },
    { asin:'B0BYZ9RRBM', category:'Parlante Bluetooth', brand:'Ultimate Ears', title:'Ultimate Ears HYPERBOOM Bluetooth Party Speaker', price_usd:299.99, rating:4.5, description:'Altavoz para fiestas con potente sonido 360°, 24 horas de batería y 4 entradas de audio.', features:['360° sonido','24 horas batería','4 entradas audio','IP67'], images:['https://m.media-amazon.com/images/I/71a1H1SSPFL._AC_SL1500_.jpg'] },
    { asin:'B0BFKQ2L41', category:'Parlante Bluetooth', brand:'Harman Kardon', title:'Harman Kardon Onyx Studio 8 Bluetooth Speaker', price_usd:199.95, rating:4.4, description:'Altavoz premium Harman Kardon con diseño elegante, 8 horas de batería y sonido 360°.', features:['Sonido 360°','8 horas batería','Diseño premium','IP55'], images:['https://m.media-amazon.com/images/I/61v2ZbNPSSL._AC_SL1500_.jpg'] },
    { asin:'B07CTTM3HP', category:'Parlante Bluetooth', brand:'Tribit', title:'Tribit XSound Go Bluetooth Speaker 16W IPX7', price_usd:35.99, rating:4.5, description:'Altavoz bluetooth económico con 16W, IPX7 y 24 horas de batería en formato compacto.', features:['16W potencia','IPX7 agua','24 horas batería','Modo XBass'], images:['https://m.media-amazon.com/images/I/71Xfn2bkEcL._AC_SL1500_.jpg'] },
    { asin:'B0CGPB9RRS', category:'Parlante Bluetooth', brand:'JBL', title:'JBL Xtreme 4 Bluetooth Speaker 40W IP67', price_usd:299.95, rating:4.6, description:'Altavoz bluetooth de gran potencia 40W con 24 horas de batería y carga de dispositivos.', features:['40W potencia','24 horas batería','IP67','Carga dispositivos USB-C'], images:['https://m.media-amazon.com/images/I/71lTRCOALGL._AC_SL1500_.jpg'] },
    { asin:'B0C2BNHMLX', category:'Parlante Bluetooth', brand:'W-King', title:'W-KING D9-1 Altavoz Bluetooth 80W IPX6', price_usd:69.99, rating:4.4, description:'Altavoz bluetooth de alta potencia 80W con graves profundos y efectos de luz RGB.', features:['80W potencia','Luces RGB','24 horas batería','IPX6 resistente'], images:['https://m.media-amazon.com/images/I/71rnbZ2zBhL._AC_SL1500_.jpg'] },
    { asin:'B08LG2X98X', category:'Power Bank', brand:'Anker', title:'Anker 548 Power Bank 60W 192Wh 10000mAh', price_usd:89.99, rating:4.6, description:'Power bank de alta capacidad con display LCD y carga de hasta 60W para laptops y más.', features:['10000mAh/192Wh','60W salida','Pantalla LCD','Recarga laptops'], images:['https://m.media-amazon.com/images/I/61LQBi4zjkL._AC_SL1500_.jpg'] },
    { asin:'B09X9BGCVJ', category:'Power Bank', brand:'INIU', title:'INIU Power Bank 25000mAh 65W PD Portátil', price_usd:49.99, rating:4.6, description:'Power bank 25000mAh con carga rápida 65W PD para laptop, celular y tablet simultáneamente.', features:['25000mAh','65W PD','3 puertos','Display digital'], images:['https://m.media-amazon.com/images/I/71ykLiKNuoL._AC_SL1500_.jpg'] },
    { asin:'B09WX5YBR2', category:'Power Bank', brand:'Baseus', title:'Baseus Power Bank 10000mAh 22.5W Fast Charging', price_usd:29.99, rating:4.5, description:'Power bank ultradelgado 10000mAh con carga rápida 22.5W y pantalla LED.', features:['10000mAh','22.5W rápida','Ultra delgado','Pantalla LED'], images:['https://m.media-amazon.com/images/I/71rqj-UJnWL._AC_SL1500_.jpg'] },
    { asin:'B07JZ9HM3C', category:'Power Bank', brand:'Mophie', title:'mophie Powerstation Plus 10000mAh MFi Lightning', price_usd:59.95, rating:4.4, description:'Power bank con cable Lightning y USB-C integrados, 10000mAh y carga rápida 18W.', features:['Cable integrado Lightning + USB-C','10000mAh','18W rápida','MFi certificado'], images:['https://m.media-amazon.com/images/I/61KQiMaXKRL._AC_SL1500_.jpg'] },
    { asin:'B0CB4G29VW', category:'Power Bank', brand:'Anker', title:'Anker MagGo Power Bank 10000mAh MagSafe', price_usd:55.99, rating:4.5, description:'Power bank MagSafe magnético para iPhone con 10000mAh y carga inalámbrica 7.5W.', features:['MagSafe 7.5W','10000mAh','Stand plegable','USB-C 20W PD'], images:['https://m.media-amazon.com/images/I/71TDgMlxdCL._AC_SL1500_.jpg'] },
    { asin:'B0CFYWBT78', category:'Power Bank', brand:'Belkin', title:'Belkin BoostCharge MagSafe 10000mAh Wireless', price_usd:79.99, rating:4.3, description:'Power bank MagSafe certificado con carga inalámbrica integrada para iPhone.', features:['MagSafe certificado','10000mAh','15W inalámbrico','USB-C 20W'], images:['https://m.media-amazon.com/images/I/71oy0ZNRuWL._AC_SL1500_.jpg'] },
    { asin:'B08KJDT3VP', category:'Power Bank', brand:'RAVPower', title:'RAVPower 20000mAh Power Bank 65W PD', price_usd:39.99, rating:4.5, description:'Power bank 20000mAh con carga rápida 65W para laptops, celulares y tablets.', features:['20000mAh','65W PD laptop','3 puertos USB','Indicador LED'], images:['https://m.media-amazon.com/images/I/71bxgTwPWtL._AC_SL1500_.jpg'] },
    { asin:'B09NPQXMZQ', category:'Power Bank', brand:'Elecjet', title:'Elecjet Apollo Ultra 10000mAh 100W Graphene', price_usd:59.99, rating:4.4, description:'Power bank con batería de grafeno de carga ultra rápida a 100W y capacidad 10000mAh.', features:['Batería grafeno','100W carga rápida','10000mAh','Carga completa en 28 min'], images:['https://m.media-amazon.com/images/I/61FLzv80YTL._AC_SL1500_.jpg'] },
    { asin:'B0C2KWJWQ6', category:'Power Bank', brand:'Charmast', title:'Charmast Power Bank 26800mAh 65W PD', price_usd:44.99, rating:4.4, description:'Power bank de alta capacidad 26800mAh con carga rápida 65W y 4 puertos de salida.', features:['26800mAh','65W PD','4 puertos salida','Pantalla display'], images:['https://m.media-amazon.com/images/I/71WYF3j3eAL._AC_SL1500_.jpg'] },
    { asin:'B0BYTRV1VD', category:'Power Bank', brand:'UGREEN', title:'UGREEN 10000mAh Power Bank 25W PD Slim', price_usd:22.99, rating:4.5, description:'Power bank slim y ligero 10000mAh con carga rápida 25W y cable USB-C incluido.', features:['10000mAh','25W PD','Slim 13mm','Cable USB-C incluido'], images:['https://m.media-amazon.com/images/I/61sEj-m83ML._AC_SL1500_.jpg'] },
    { asin:'B09BWXKDQS', category:'Ventilador USB', brand:'TOPIN', title:'TOPIN Ventilador USB de Mesa Silencioso 3 Velocidades', price_usd:19.99, rating:4.4, description:'Ventilador USB de sobremesa con 3 velocidades, 360° rotación vertical y operación silenciosa.', features:['3 velocidades','Rotación 360°','Silencioso <40dB','USB powered'], images:['https://m.media-amazon.com/images/I/71UKNLdyFSL._AC_SL1500_.jpg'] },
    { asin:'B07DB34JLK', category:'Ventilador USB', brand:'Vornado', title:'Vornado Flippi V6 Personal USB Fan', price_usd:21.99, rating:4.4, description:'Ventilador personal USB Vornado con circulación Vortex y diseño articulado de 360°.', features:['Circulación Vortex','Articulación 360°','USB o pila','Compacto'], images:['https://m.media-amazon.com/images/I/71mRNklhFYL._AC_SL1500_.jpg'] },
    { asin:'B07YMHJ8RY', category:'Ventilador USB', brand:'Honeywell', title:'Honeywell HTF090B Turbo on the Go USB Fan', price_usd:14.99, rating:4.4, description:'Ventilador turbo USB compacto con 2 velocidades y rotación de 90°, perfecto para el escritorio.', features:['2 velocidades','Rotación 90°','Turbo silencioso','USB-A'], images:['https://m.media-amazon.com/images/I/81lDzO1BAEL._AC_SL1500_.jpg'] },
    { asin:'B09WVBRQPZ', category:'Ventilador USB', brand:'OPOLAR', title:'OPOLAR USB Desk Fan 10 Velocidades Silencioso', price_usd:22.99, rating:4.5, description:'Ventilador de escritorio USB con 10 velocidades, control táctil y función oscilación 80°.', features:['10 velocidades','Oscilación 80°','Control táctil','Silencioso'], images:['https://m.media-amazon.com/images/I/61ypYxpQoWL._AC_SL1500_.jpg'] },
    { asin:'B0B2QNR5TY', category:'Ventilador USB', brand:'Dreo', title:'Dreo Ventilador USB Recargable 4000mAh 3 en 1', price_usd:34.99, rating:4.5, description:'Ventilador portátil recargable 4000mAh con función humidificador y difusor de aroma.', features:['Batería 4000mAh','3 en 1: ventilador/humidificador/difusor','8 horas batería','Portátil'], images:['https://m.media-amazon.com/images/I/71hzpL5gEML._AC_SL1500_.jpg'] },
    { asin:'B0BTZWJHF3', category:'Ventilador USB', brand:'Comlife', title:'COMLIFE USB Desk Fan 4000mAh Recargable', price_usd:26.99, rating:4.4, description:'Ventilador USB recargable con batería 4000mAh, 3 velocidades y LED nocturno.', features:['4000mAh recargable','3 velocidades','LED nocturno','USB-C carga'], images:['https://m.media-amazon.com/images/I/71sB5gu7DmL._AC_SL1500_.jpg'] },
    { asin:'B08CJK9T5F', category:'Ventilador USB', brand:'Zhopus', title:'Ventilador USB Cuello Portátil Manos Libres', price_usd:29.99, rating:4.2, description:'Ventilador de cuello inalámbrico manos libres con 3 velocidades y batería recargable.', features:['Diseño cuello','3 velocidades','Batería recargable','Sin ruido'], images:['https://m.media-amazon.com/images/I/71BLfWq4xzL._AC_SL1500_.jpg'] },
    { asin:'B09ZMN3W4B', category:'Ventilador USB', brand:'Midea', title:'Midea USB Tower Fan 30" Ventilador de Torre', price_usd:49.99, rating:4.3, description:'Ventilador de torre USB con control remoto, temporizador y 3 modos de viento.', features:['30" altura','3 modos viento','Temporizador','Control remoto'], images:['https://m.media-amazon.com/images/I/71-Gj7e+WmL._AC_SL1500_.jpg'] },
    { asin:'B0CJ3HZBBL', category:'Ventilador USB', brand:'PELONIS', title:'PELONIS Ventilador USB Mini DC Motor Silencioso', price_usd:15.99, rating:4.3, description:'Mini ventilador USB ultra silencioso con motor DC de bajo consumo y 3 velocidades.', features:['Motor DC silencioso','3 velocidades','Bajo consumo','USB-A'], images:['https://m.media-amazon.com/images/I/71L8l94Pq5L._AC_SL1500_.jpg'] },
    { asin:'B0BRL6B3JV', category:'Ventilador USB', brand:'Treva', title:'Treva 6" Clip Fan USB Ventilador Pinza Flexible', price_usd:17.99, rating:4.3, description:'Ventilador USB con pinza flexible para sujetar en cualquier superficie, 6" silencioso.', features:['Pinza flexible','2 velocidades','6" diámetro','USB-A'], images:['https://m.media-amazon.com/images/I/61kJAGnFlYL._AC_SL1500_.jpg'] },
    { asin:'B09VPFH553', category:'Monitor Gaming', brand:'LG', title:'LG 27GP850-B 27" 1440p 165Hz Nano IPS Gaming', price_usd:279.99, rating:4.7, description:'Monitor gaming LG 27" QHD 165Hz con panel Nano IPS, 1ms GtG y HDMI 2.0.', features:['1440p QHD','165Hz','Nano IPS 1ms','NVIDIA G-Sync compatible'], images:['https://m.media-amazon.com/images/I/81-9oXzW9CL._AC_SL1500_.jpg'] },
    { asin:'B0BJ3BZYJT', category:'Monitor Gaming', brand:'Samsung', title:'Samsung 27" Odyssey G5 QHD 165Hz Curved Gaming', price_usd:299.99, rating:4.6, description:'Monitor gaming curvo Samsung 27" QHD con 165Hz, 1ms y curvatura 1000R para inmersión total.', features:['1440p QHD','165Hz','Curvo 1000R','1ms tiempo respuesta'], images:['https://m.media-amazon.com/images/I/81lqm6WKYOL._AC_SL1500_.jpg'] },
    { asin:'B09GKWWM7F', category:'Monitor Gaming', brand:'ASUS', title:'ASUS ROG Strix 27" WQHD 170Hz IPS Gaming', price_usd:499.99, rating:4.6, description:'Monitor gaming ASUS ROG 27" WQHD con 170Hz, Fast IPS y ROG STRIX gaming.', features:['WQHD 2560x1440','170Hz Fast IPS','G-Sync + FreeSync','Altavoces integrados'], images:['https://m.media-amazon.com/images/I/71RcWH0JgJL._AC_SL1500_.jpg'] },
    { asin:'B0C3LSDQ4M', category:'Monitor Gaming', brand:'MSI', title:'MSI Optix MAG274QRF-QD 27" 165Hz QLED IPS', price_usd:349.99, rating:4.5, description:'Monitor gaming MSI 27" QLED con 165Hz, IPS y cobertura de color DCI-P3 95%.', features:['1440p QHD QLED','165Hz IPS','DCI-P3 95%','Rapid IPS 1ms'], images:['https://m.media-amazon.com/images/I/81bF4Tq9YhL._AC_SL1500_.jpg'] },
    { asin:'B0BCJ2FMJW', category:'Monitor Gaming', brand:'Gigabyte', title:'Gigabyte M27Q X 27" 240Hz IPS HDR400 Gaming', price_usd:349.99, rating:4.5, description:'Monitor gaming 240Hz con panel IPS, HDR400 y KVM integrado para múltiples dispositivos.', features:['240Hz','IPS HDR400','KVM integrado','1440p QHD'], images:['https://m.media-amazon.com/images/I/71zfB3XSNJL._AC_SL1500_.jpg'] },
    { asin:'B0BKR24DTB', category:'Monitor Gaming', brand:'AOC', title:'AOC C27G2Z 27" Curved 240Hz VA 1ms Gaming', price_usd:199.99, rating:4.4, description:'Monitor gaming curvo 240Hz con panel VA, 1ms de respuesta y FreeSync Premium.', features:['240Hz','VA 1ms','Curvo 1500R','FreeSync Premium'], images:['https://m.media-amazon.com/images/I/81-7yopvnBL._AC_SL1500_.jpg'] },
    { asin:'B09XHN9KZQ', category:'Monitor Gaming', brand:'Dell', title:'Dell S2722DGM 27" Curved QHD 165Hz Gaming', price_usd:249.99, rating:4.5, description:'Monitor gaming curvo Dell 27" QHD 165Hz con AMD FreeSync Premium y panel VA.', features:['1440p QHD','165Hz VA','Curvo 1800R','FreeSync Premium'], images:['https://m.media-amazon.com/images/I/81yMy7kPlsL._AC_SL1500_.jpg'] },
    { asin:'B0C2Y5KLWV', category:'Monitor Gaming', brand:'LG', title:'LG 32GQ950-B 32" 4K 160Hz Nano IPS OLED-like', price_usd:699.99, rating:4.6, description:'Monitor gaming LG 32" 4K UHD 160Hz con panel Nano IPS, HDR1000 y DCI-P3 98%.', features:['4K 160Hz','Nano IPS HDR1000','DCI-P3 98%','NVIDIA G-Sync'], images:['https://m.media-amazon.com/images/I/81SLkfcOSLL._AC_SL1500_.jpg'] },
    { asin:'B09NJHVLM6', category:'Monitor Gaming', brand:'Acer', title:'Acer Predator XB273K 27" 4K 144Hz IPS Gaming', price_usd:599.99, rating:4.4, description:'Monitor gaming 4K 144Hz con G-Sync, HDR400 y conectividad DisplayPort 1.4.', features:['4K 144Hz','G-Sync','HDR400','IPS 1ms'], images:['https://m.media-amazon.com/images/I/81fWMxmxaKL._AC_SL1500_.jpg'] },
    { asin:'B0CG5T4Z2G', category:'Monitor Gaming', brand:'Samsung', title:'Samsung 49" Odyssey OLED G9 240Hz Ultra-Wide', price_usd:1299.99, rating:4.6, description:'Monitor OLED ultra ancho 49" con 240Hz, curvatura 1800R y resolución 5120x1440.', features:['5120x1440 dual QHD','240Hz OLED','Curvo 1800R','0.03ms GtG'], images:['https://m.media-amazon.com/images/I/81hFCTg0f0L._AC_SL1500_.jpg'] },
  ];

  const summary = { inserted: 0, skipped: 0, errors: 0, categories: {} };
  try {
    const now = new Date().toISOString();
    for (const p of PRODUCTS) {
      if (!summary.categories[p.category]) summary.categories[p.category] = { inserted: 0, skipped: 0 };
      try {
        const src = p.source || (p.supplier_name === 'Dropi' ? 'dropi' : 'amazon');
        const existing = p.asin
          ? await get('SELECT id FROM catalog WHERE asin = ?', [p.asin])
          : await get('SELECT id FROM catalog WHERE title = ? AND source = ?', [p.title, src]);
        if (existing) { summary.skipped++; summary.categories[p.category].skipped++; continue; }
        await run(
          `INSERT INTO catalog (asin, title, description, price_usd, images, category, brand, features, rating, source, supplier_name, supplier_price_cop, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
          [p.asin || null, p.title, p.description, p.price_usd || null, JSON.stringify(p.images),
           p.category, p.brand, JSON.stringify(p.features), p.rating,
           src, p.supplier_name || null, p.supplier_price_cop || null, now, now]
        );
        summary.inserted++; summary.categories[p.category].inserted++;
      } catch (e) { summary.errors++; }
    }
    const total = await get("SELECT COUNT(*) as cnt FROM catalog WHERE status = 'ready'");
    summary.total_in_catalog = total?.cnt || 0;
    logger.info(`seed-catalog completado: ${summary.inserted} insertados, total ${summary.total_in_catalog}`);
    res.json({ success: true, summary });
  } catch (err) {
    logger.error('seed-catalog error fatal:', err.message);
    res.status(500).json({ error: err.message, summary });
  }
});

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
