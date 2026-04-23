const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database');
const mlService = require('../services/mercadolibre');

router.get('/', async (req, res) => {
  try {
    const { unread_only } = req.query;
    const where = unread_only === 'true' ? 'WHERE a.is_read = 0' : 'WHERE 1=1';
    const alerts = await all(
      `SELECT a.*, p.ml_title, p.amazon_title, p.asin
       FROM alerts a
       LEFT JOIN products p ON p.id = a.product_id
       ${where} ORDER BY a.created_at DESC LIMIT 100`
    );
    const unreadRow = await get('SELECT COUNT(*) as cnt FROM alerts WHERE is_read = 0');
    res.json({ alerts, unread_count: unreadRow?.cnt || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/unread-count', async (req, res) => {
  try {
    const row = await get('SELECT COUNT(*) as cnt FROM alerts WHERE is_read = 0');
    res.json({ count: row?.cnt || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/read-all', async (req, res) => {
  try {
    await run('UPDATE alerts SET is_read = 1');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/read', async (req, res) => {
  try {
    await run('UPDATE alerts SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM alerts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/config', async (req, res) => {
  try {
    const configs = await all(
      `SELECT ac.*, p.ml_title, p.amazon_title, p.asin, p.ml_stock
       FROM alert_configs ac
       JOIN products p ON p.id = ac.product_id
       ORDER BY p.ml_title`
    );
    res.json(configs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config/:productId', async (req, res) => {
  try {
    const { low_stock_threshold = 5, enabled = 1 } = req.body;
    await run(
      'INSERT OR REPLACE INTO alert_configs (product_id, low_stock_threshold, enabled) VALUES (?, ?, ?)',
      [req.params.productId, low_stock_threshold, enabled ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/check-stock', async (req, res) => {
  try {
    const products = await all(
      `SELECT p.*, ac.low_stock_threshold, ac.enabled
       FROM products p
       LEFT JOIN alert_configs ac ON ac.product_id = p.id
       WHERE p.ml_status = 'active' AND p.ml_item_id IS NOT NULL`
    );
    let alertsCreated = 0;
    const now = new Date().toISOString();
    for (const product of products) {
      try {
        const mlItem = await mlService.getItem(product.ml_item_id);
        const currentStock = mlItem.available_quantity || 0;
        await run('UPDATE products SET ml_stock=?, updated_at=? WHERE id=?', [currentStock, now, product.id]);
        const threshold = product.low_stock_threshold ?? 5;
        if (product.enabled !== 0 && currentStock > 0 && currentStock <= threshold) {
          const existing = await get(
            `SELECT id FROM alerts WHERE product_id=? AND alert_type='low_stock' AND is_read=0`, [product.id]
          );
          if (!existing) {
            await run(
              `INSERT INTO alerts (product_id, alert_type, threshold, message, created_at) VALUES (?, 'low_stock', ?, ?, ?)`,
              [product.id, threshold, `Stock bajo: ${currentStock} unidades (umbral: ${threshold})`, now]
            );
            alertsCreated++;
          }
        }
        if (currentStock === 0) {
          const existing = await get(
            `SELECT id FROM alerts WHERE product_id=? AND alert_type='out_of_stock' AND is_read=0`, [product.id]
          );
          if (!existing) {
            await mlService.pauseItem(product.ml_item_id);
            await run('UPDATE products SET ml_status=?,sync_status=?,updated_at=? WHERE id=?',
              ['paused', 'paused', now, product.id]);
            await run(
              `INSERT INTO alerts (product_id, alert_type, message, created_at) VALUES (?, 'out_of_stock', ?, ?)`,
              [product.id, 'Sin stock: publicación pausada automáticamente en ML', now]
            );
            alertsCreated++;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (e) { /* skip individual errors */ }
    }
    res.json({ success: true, checked: products.length, alerts_created: alertsCreated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
