const express = require("express");
const router = express.Router();
const mlService = require("../services/mercadolibre");

router.get("/categories", async (req, res) => {
  const { q } = req.query;
  try {
    const cat = await mlService.predictCategory(q || "electronica");
    res.json(cat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/trm", async (req, res) => {
  try {
    const trm = await mlService.getCurrentTRM();
    res.json({ trm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
