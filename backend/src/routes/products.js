const express = require("express");
const router = express.Router();
const { run, get, all, logAction } = require("../database");
const amazonService = require("../services/amazon");
const mlService = require("../services/mercadolibre");

router.get("/", async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "WHERE 1=1"; const params = [];
    if (status) { where += " AND sync_status = ?"; params.push(status); }
    if (search) { where += " AND (amazon_title LIKE ? OR asin LIKE ? OR ml_title LIKE ?)"; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
    const totalRow = await get(`SELECT COUNT(*) as cnt FROM products ${where}`, params);
    const rows = await all(`SELECT * FROM products ${where} ORDER BY updated_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`, params);
    res.json({ products: rows.map(p => ({...p, amazon_images: JSON.parse(p.amazon_images||"[]"), amazon_features: JSON.parse(p.amazon_features||"[]")})), total: totalRow ? totalRow.cnt : 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", async (req, res) => {
  try {
    const p = await get("SELECT * FROM products WHERE id = ? OR asin = ?", [req.params.id, req.params.id]);
    if (!p) return res.status(404).json({ error: "No encontrado" });
    res.json({...p, amazon_images: JSON.parse(p.amazon_images||"[]"), amazon_features: JSON.parse(p.amazon_features||"[]")});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/import", async (req, res) => {
  const { asin_or_url } = req.body;
  if (!asin_or_url) return res.status(400).json({ error: "Se requiere ASIN o URL" });
  try {
    const asin = amazonService.extractAsin(asin_or_url);
    const existing = await get("SELECT id FROM products WHERE asin = ?", [asin]);
    if (existing) return res.status(409).json({ error: "Producto ya importado", product_id: existing.id, asin });
    const product = await amazonService.getProductByAsin(asin);
    const priceCop = mlService.calculatePrice(product.price_usd);
    const category = await mlService.predictCategory(product.title);
    const now = new Date().toISOString();
    const result = await run(
      "INSERT INTO products (asin,amazon_title,amazon_description,amazon_price_usd,amazon_images,amazon_category,amazon_brand,amazon_rating,amazon_features,ml_title,ml_description,ml_price_cop,ml_category_id,sync_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)",
      [asin,product.title,product.description,product.price_usd,JSON.stringify(product.images),product.category,product.brand,product.rating,JSON.stringify(product.features),product.title,product.description,priceCop,category?category.id:null,now,now]
    );
    await logAction({ product_id: result.lastInsertRowid, action: "import", status: "ok", message: "Importado: "+product.title, new_price: priceCop });
    res.json({ success: true, product_id: result.lastInsertRowid, asin, title: product.title, price_usd: product.price_usd, price_cop: priceCop, images: product.images, category, source: product.source });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { ml_title, ml_description, ml_price_cop, ml_category_id, ml_condition, ml_stock, markup_percent, min_price_cop } = req.body;
    await run("UPDATE products SET ml_title=COALESCE(?,ml_title),ml_description=COALESCE(?,ml_description),ml_price_cop=COALESCE(?,ml_price_cop),ml_category_id=COALESCE(?,ml_category_id),ml_condition=COALESCE(?,ml_condition),ml_stock=COALESCE(?,ml_stock),markup_percent=COALESCE(?,markup_percent),min_price_cop=COALESCE(?,min_price_cop),updated_at=? WHERE id=?",
      [ml_title,ml_description,ml_price_cop,ml_category_id,ml_condition,ml_stock,markup_percent,min_price_cop,new Date().toISOString(),req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const product = await get("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product) return res.status(404).json({ error: "No encontrado" });
    const images = JSON.parse(product.amazon_images||"[]");
    const mlResult = await mlService.publishProduct({ title: product.ml_title||product.amazon_title, description: product.ml_description||product.amazon_description, price_cop: product.ml_price_cop, category_id: product.ml_category_id, ml_condition: product.ml_condition, stock: product.ml_stock||10, image_urls: images.slice(0,8), brand: product.amazon_brand||null });
    const publishedAt = new Date().toISOString();
    await run("UPDATE products SET ml_item_id=?,ml_status='active',sync_status='synced',sync_error=NULL,last_synced_at=?,updated_at=? WHERE id=?", [mlResult.ml_item_id, publishedAt, publishedAt, product.id]);
    await logAction({ product_id: product.id, action: "publish", status: "ok", message: "Publicado: "+mlResult.ml_item_id, new_price: product.ml_price_cop });
    res.json({ success: true, ...mlResult });
  } catch (err) {
    await run("UPDATE products SET sync_status='error',sync_error=? WHERE id=?", [err.message, req.params.id]);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/pause", async (req, res) => {
  try {
    const product = await get("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product||!product.ml_item_id) return res.status(400).json({ error: "No publicado en ML" });
    await mlService.pauseItem(product.ml_item_id);
    await run("UPDATE products SET ml_status='paused',sync_status='paused',updated_at=? WHERE id=?", [new Date().toISOString(), product.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req, res) => {
  try { await run("DELETE FROM products WHERE id = ?", [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/logs", async (req, res) => {
  try { const logs = await all("SELECT * FROM sync_logs WHERE product_id = ? ORDER BY created_at DESC LIMIT 50", [req.params.id]); res.json(logs); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/bulk-price", async (req, res) => {
  try {
    const { product_ids, markup_percent, price_cop } = req.body;
    if (!product_ids || !product_ids.length) return res.status(400).json({ error: "Se requieren IDs" });
    const results = { updated: 0, errors: 0 };
    const now = new Date().toISOString();
    for (const id of product_ids) {
      try {
        const product = await get("SELECT * FROM products WHERE id = ?", [id]);
        if (!product) continue;
        let newPrice = price_cop;
        if (!newPrice && markup_percent !== undefined) {
          newPrice = mlService.calculatePrice(product.amazon_price_usd, { margin: markup_percent / 100 });
        }
        if (!newPrice) continue;
        await run("UPDATE products SET ml_price_cop=?, markup_percent=COALESCE(?,markup_percent), updated_at=? WHERE id=?",
          [newPrice, markup_percent ?? null, now, id]);
        if (product.ml_item_id && product.ml_status === "active") {
          await mlService.updatePrice(product.ml_item_id, newPrice);
        }
        results.updated++;
      } catch (e) { results.errors++; }
    }
    res.json({ success: true, ...results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
