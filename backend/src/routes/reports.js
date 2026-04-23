const express = require('express');
const router = express.Router();
const { get, all } = require('../database');

router.get('/summary', async (req, res) => {
  try {
    const revenue = await get(`SELECT COUNT(*) as total_orders, SUM(total_amount) as total_revenue FROM orders_cache WHERE status != 'cancelled'`);
    const products = await get(`SELECT COUNT(*) as total, SUM(CASE WHEN sync_status='synced' THEN 1 ELSE 0 END) as synced FROM products`);
    const recent = await get(`SELECT COUNT(*) as cnt FROM orders_cache WHERE order_date >= datetime('now', '-7 days') AND status != 'cancelled'`);
    const alerts = await get(`SELECT COUNT(*) as cnt FROM alerts WHERE is_read = 0`);
    res.json({
      total_orders: revenue?.total_orders || 0,
      total_revenue: revenue?.total_revenue || 0,
      total_products: products?.total || 0,
      synced_products: products?.synced || 0,
      orders_last_7_days: recent?.cnt || 0,
      unread_alerts: alerts?.cnt || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sales-by-day', async (req, res) => {
  try {
    const rows = await all(`
      SELECT DATE(order_date) as day, COUNT(*) as orders, SUM(total_amount) as revenue
      FROM orders_cache
      WHERE order_date >= datetime('now', '-30 days') AND status != 'cancelled'
      GROUP BY DATE(order_date) ORDER BY day ASC
    `);
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.toISOString().split('T')[0];
      const found = rows.find(r => r.day === day);
      result.push({ day, orders: found?.orders || 0, revenue: found?.revenue || 0 });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/top-products', async (req, res) => {
  try {
    const rows = await all(`
      SELECT oc.ml_item_id, p.ml_title, p.amazon_title, p.asin,
             COUNT(oc.id) as order_count, SUM(oc.total_amount) as total_revenue
      FROM orders_cache oc
      LEFT JOIN products p ON p.ml_item_id = oc.ml_item_id
      WHERE oc.status != 'cancelled'
      GROUP BY oc.ml_item_id ORDER BY order_count DESC LIMIT 10
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/price-comparison', async (req, res) => {
  try {
    const config = await get("SELECT value FROM config WHERE key = 'trm'");
    const trm = parseFloat(config?.value || '4200');
    const products = await all(`
      SELECT id, asin, ml_title, amazon_title, amazon_price_usd, ml_price_cop, ml_status, markup_percent
      FROM products WHERE amazon_price_usd IS NOT NULL AND ml_price_cop IS NOT NULL
      ORDER BY updated_at DESC LIMIT 50
    `);
    res.json(products.map(p => ({
      ...p,
      amazon_price_cop: Math.round(p.amazon_price_usd * trm),
      margin_percent: p.amazon_price_usd
        ? Math.round(((p.ml_price_cop - p.amazon_price_usd * trm) / (p.amazon_price_usd * trm)) * 100)
        : 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
