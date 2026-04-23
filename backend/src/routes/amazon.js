const express = require("express");
const router = express.Router();
const amazonService = require("../services/amazon");

router.get("/product", async (req, res) => {
  const { asin } = req.query;
  if (!asin) return res.status(400).json({ error: "ASIN requerido" });
  try {
    const product = await amazonService.getProductByAsin(asin);
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
