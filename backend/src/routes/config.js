const express = require("express");
const router = express.Router();
const { getConfig, setConfig, all } = require("../database");
const mlService = require("../services/mercadolibre");
const { loadConfig } = mlService;

router.get("/", async (req, res) => {
  try {
    const rows = await all("SELECT key, value FROM config");
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/", async (req, res) => {
  const allowed = ["trm","ml_commission","default_margin","min_price_cop","sync_frequency","auto_update_trm"];
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) await setConfig(key, value);
    }
    await mlService.loadConfig();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/trm", async (req, res) => {
  try {
    const trm = await mlService.getCurrentTRM();
    await setConfig("trm", trm.toString());
    res.json({ trm, updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message, trm: parseFloat(await getConfig("trm") || "4200") });
  }
});

router.get("/price-rules", async (req, res) => {
  try {
    const rules = await all("SELECT * FROM price_rules ORDER BY id");
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
