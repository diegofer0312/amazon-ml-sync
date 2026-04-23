const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database');
const axios = require('axios');

const ML_API = 'https://api.mercadolibre.com';

router.get('/', async (req, res) => {
  try {
    const accounts = await all('SELECT id, nickname, user_id, site_id, is_active, created_at FROM ml_accounts ORDER BY is_active DESC, created_at DESC');
    res.json(accounts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/auth-url', (req, res) => {
  const appId = process.env.ML_APP_ID;
  if (!appId) return res.status(400).json({ error: 'ML_APP_ID no configurado' });
  const redirectUri = encodeURIComponent(process.env.ML_REDIRECT_URI_ACCOUNTS || `http://localhost:3001/api/ml-accounts/callback`);
  const url = `https://auth.mercadolibre.com.co/authorization?response_type=code&client_id=${appId}&redirect_uri=${redirectUri}`;
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.send('<script>window.close()</script>');
    const redirectUri = process.env.ML_REDIRECT_URI_ACCOUNTS || `http://localhost:3001/api/ml-accounts/callback`;
    const { data } = await axios.post(`${ML_API}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: process.env.ML_APP_ID,
      client_secret: process.env.ML_SECRET_KEY,
      code,
      redirect_uri: redirectUri,
    });
    const { data: user } = await axios.get(`${ML_API}/users/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await run('UPDATE ml_accounts SET is_active = 0');
    await run(
      `INSERT OR REPLACE INTO ml_accounts (nickname, user_id, access_token, refresh_token, token_expires_at, site_id, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [user.nickname, String(user.id), data.access_token, data.refresh_token, expiresAt, user.site_id || 'MCO']
    );
    process.env.ML_ACCESS_TOKEN = data.access_token;
    process.env.ML_REFRESH_TOKEN = data.refresh_token;
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h3>✅ Cuenta conectada exitosamente</h3><p>Puedes cerrar esta ventana.</p><script>window.opener?.postMessage("ml_auth_done","*");setTimeout(()=>window.close(),2000);</script></body></html>');
  } catch (err) {
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h3>❌ Error</h3><p>${err.message}</p></body></html>`);
  }
});

router.put('/:id/activate', async (req, res) => {
  try {
    const account = await get('SELECT * FROM ml_accounts WHERE id = ?', [req.params.id]);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
    await run('UPDATE ml_accounts SET is_active = 0');
    await run('UPDATE ml_accounts SET is_active = 1 WHERE id = ?', [req.params.id]);
    process.env.ML_ACCESS_TOKEN = account.access_token;
    process.env.ML_REFRESH_TOKEN = account.refresh_token;
    res.json({ success: true, nickname: account.nickname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM ml_accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
