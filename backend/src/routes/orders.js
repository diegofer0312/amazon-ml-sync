const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database');
const mlService = require('../services/mercadolibre');

async function syncOrders() {
  const mlData = await mlService.getOrders(0, 100);
  const now = new Date().toISOString();
  let saved = 0;
  for (const order of mlData.results || []) {
    const item = order.order_items?.[0];
    await run(
      `INSERT OR REPLACE INTO orders_cache
       (ml_order_id, ml_item_id, buyer_nickname, total_amount, status, shipping_status, order_date, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(order.id), item?.item?.id, order.buyer?.nickname,
       order.total_amount, order.status, order.shipping?.status, order.date_created, now]
    );
    saved++;
  }
  return saved;
}

router.get('/', async (req, res) => {
  try {
    const { offset = 0, limit = 20, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND oc.status = ?'; params.push(status); }
    const totalRow = await get(`SELECT COUNT(*) as cnt FROM orders_cache oc ${where}`, params);
    const orders = await all(
      `SELECT oc.*, p.ml_title, p.amazon_title, p.asin, p.id as product_db_id,
              p.amazon_images as product_images
       FROM orders_cache oc
       LEFT JOIN products p ON p.ml_item_id = oc.ml_item_id
       ${where}
       ORDER BY oc.order_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ orders, total: totalRow?.cnt || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/refresh', async (req, res) => {
  try {
    const saved = await syncOrders();
    res.json({ success: true, saved });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
