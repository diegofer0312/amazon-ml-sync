// routes/auth.js - OAuth de Mercado Libre
const express = require('express');
const axios = require('axios');
const { setConfig } = require('../database');
const logger = require('../utils/logger');
const router = express.Router();

const ML_API = 'https://api.mercadolibre.com';

const TUNNEL_URL = 'https://amazonmlsync2024.loca.lt';
const getRedirectUri = () => `${TUNNEL_URL}/api/auth/callback`;

// GET /api/auth/ml - Iniciar flujo OAuth con ML
router.get('/ml', (req, res) => {
  const appId = process.env.ML_APP_ID;
  const redirectUri = encodeURIComponent(getRedirectUri());
  const url = `https://auth.mercadolibre.com.co/authorization?response_type=code&client_id=${appId}&redirect_uri=${redirectUri}`;
  res.json({ auth_url: url });
});

// GET /api/auth/callback - Recibir código de ML y obtener token
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  logger.info('ML callback recibido - code: ' + code + ' error: ' + error);

  if (error) {
    logger.error('ML rechazó la autorización: ' + error);
    return res.redirect(`http://localhost:5173/config?error=${encodeURIComponent(error)}`);
  }
  if (!code) return res.status(400).json({ error: 'Código de autorización requerido' });

  const redirectUri = getRedirectUri();
  logger.info('Intercambiando código por token - redirect_uri: ' + redirectUri);

  try {
    const { data } = await axios.post(`${ML_API}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: process.env.ML_APP_ID,
      client_secret: process.env.ML_SECRET_KEY,
      code,
      redirect_uri: redirectUri,
    });

    logger.info('Token obtenido exitosamente - user_id: ' + data.user_id);
    process.env.ML_ACCESS_TOKEN = data.access_token;
    process.env.ML_REFRESH_TOKEN = data.refresh_token;
    setConfig('ml_access_token', data.access_token);
    setConfig('ml_refresh_token', data.refresh_token);

    res.redirect('http://localhost:5173/config?connected=true');
  } catch (err) {
    const mlError = err.response?.data;
    logger.error('Error al intercambiar token ML: ' + JSON.stringify(mlError || err.message));
    const msg = encodeURIComponent(mlError?.message || mlError?.error || err.message);
    res.redirect(`http://localhost:5173/config?error=${msg}`);
  }
});

// GET /api/auth/status - Estado de autenticación
router.get('/status', async (req, res) => {
  const hasAmazon = !!(process.env.AMAZON_CLIENT_ID && !process.env.AMAZON_CLIENT_ID.includes('XXXXX'));
  const hasML = !!(process.env.ML_ACCESS_TOKEN && !process.env.ML_ACCESS_TOKEN.includes('XXXXX'));

  let mlUser = null;
  if (hasML) {
    try {
      const { data } = await axios.get(`${ML_API}/users/me`, {
        headers: { Authorization: `Bearer ${process.env.ML_ACCESS_TOKEN}` },
      });
      mlUser = { id: data.id, nickname: data.nickname, email: data.email };
    } catch (e) {}
  }

  res.json({ amazon: { connected: hasAmazon }, mercadolibre: { connected: hasML, user: mlUser } });
});

module.exports = router;
