const express = require("express");
const router = express.Router();
const { all, get } = require("../database");
const { syncAllPrices, publishPendingProducts } = require("../jobs/syncPrices");

router.post("/prices", async (req, res) => {
  try {
    const stats = await syncAllPrices();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/publish-pending", async (req, res) => {
  try {
    const results = await publishPendingProducts();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await all(
      `SELECT l.*, p.asin, p.amazon_title as product_name
       FROM sync_logs l LEFT JOIN products p ON l.product_id = p.id
       ORDER BY l.created_at DESC LIMIT ${parseInt(limit)}`
    );
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const synced = await get("SELECT COUNT(*) as cnt FROM products WHERE sync_status = 'synced'");
    const pending = await get("SELECT COUNT(*) as cnt FROM products WHERE sync_status IN ('pending','draft')");
    const errors = await get("SELECT COUNT(*) as cnt FROM products WHERE sync_status = 'error'");
    const total = await get("SELECT COUNT(*) as cnt FROM products");
    const updatedToday = await get("SELECT COUNT(*) as cnt FROM sync_logs WHERE action='price_update' AND status='ok' AND date(created_at)=date('now')");
    const lastSync = await get("SELECT created_at FROM sync_logs WHERE action='price_update' ORDER BY created_at DESC LIMIT 1");
    res.json({
      total: total.cnt, synced: synced.cnt, pending: pending.cnt,
      errors: errors.cnt, updatedToday: updatedToday.cnt,
      lastSync: lastSync ? lastSync.created_at : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
