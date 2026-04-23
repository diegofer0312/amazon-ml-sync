# =============================================
# Script de configuracion - Amazon ML Sync
# =============================================
Set-Location "$env:USERPROFILE\OneDrive\Desktop\codigo app amazon mercado\files\backend"
Write-Host "Ubicacion: $(Get-Location)" -ForegroundColor Cyan

# --- sync.js ---
Set-Content -Path "src\routes\sync.js" -Encoding utf8 -Value @'
const express = require("express");
const router = express.Router();
const { all, get } = require("../database");

router.post("/prices", async (req, res) => { res.json({ success: true, updated: 0 }); });
router.post("/publish-pending", async (req, res) => { res.json({ success: true, results: [] }); });

router.get("/logs", async (req, res) => {
  try {
    const logs = await all("SELECT l.*, p.asin, p.amazon_title as product_name FROM sync_logs l LEFT JOIN products p ON l.product_id = p.id ORDER BY l.created_at DESC LIMIT 100");
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
    res.json({ total: total.cnt, synced: synced.cnt, pending: pending.cnt, errors: errors.cnt, updatedToday: updatedToday.cnt, lastSync: lastSync ? lastSync.created_at : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
'@
Write-Host "OK sync.js" -ForegroundColor Green

# --- products.js ---
Set-Content -Path "src\routes\products.js" -Encoding utf8 -Value @'
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
    const result = await run(
      "INSERT INTO products (asin,amazon_title,amazon_description,amazon_price_usd,amazon_images,amazon_category,amazon_brand,amazon_rating,amazon_features,ml_title,ml_description,ml_price_cop,ml_category_id,sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')",
      [asin,product.title,product.description,product.price_usd,JSON.stringify(product.images),product.category,product.brand,product.rating,JSON.stringify(product.features),product.title,product.description,priceCop,category?category.id:null]
    );
    await logAction({ product_id: result.lastInsertRowid, action: "import", status: "ok", message: "Importado: "+product.title, new_price: priceCop });
    res.json({ success: true, product_id: result.lastInsertRowid, asin, title: product.title, price_usd: product.price_usd, price_cop: priceCop, images: product.images, category, source: product.source });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { ml_title, ml_description, ml_price_cop, ml_category_id, ml_condition, ml_stock, markup_percent, min_price_cop } = req.body;
    await run("UPDATE products SET ml_title=COALESCE(?,ml_title),ml_description=COALESCE(?,ml_description),ml_price_cop=COALESCE(?,ml_price_cop),ml_category_id=COALESCE(?,ml_category_id),ml_condition=COALESCE(?,ml_condition),ml_stock=COALESCE(?,ml_stock),markup_percent=COALESCE(?,markup_percent),min_price_cop=COALESCE(?,min_price_cop),updated_at=datetime('now') WHERE id=?",
      [ml_title,ml_description,ml_price_cop,ml_category_id,ml_condition,ml_stock,markup_percent,min_price_cop,req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const product = await get("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product) return res.status(404).json({ error: "No encontrado" });
    const images = JSON.parse(product.amazon_images||"[]");
    const mlResult = await mlService.publishProduct({ title: product.ml_title||product.amazon_title, description: product.ml_description||product.amazon_description, price_cop: product.ml_price_cop, category_id: product.ml_category_id, ml_condition: product.ml_condition, stock: product.ml_stock||10, image_urls: images.slice(0,8) });
    await run("UPDATE products SET ml_item_id=?,ml_status='active',sync_status='synced',sync_error=NULL,last_synced_at=datetime('now'),updated_at=datetime('now') WHERE id=?", [mlResult.ml_item_id, product.id]);
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
    await run("UPDATE products SET ml_status='paused',sync_status='paused',updated_at=datetime('now') WHERE id=?", [product.id]);
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

module.exports = router;
'@
Write-Host "OK products.js" -ForegroundColor Green

# --- .env ---
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host "OK .env creado" -ForegroundColor Green }
else { Write-Host "OK .env ya existe" -ForegroundColor Green }

# --- Verificar ---
Write-Host ""
Write-Host "=== Verificando routers ===" -ForegroundColor Cyan
@("src/routes/products","src/routes/sync","src/routes/auth","src/routes/config","src/routes/amazon","src/routes/mercadolibre") | ForEach-Object {
    $t = node -e "try{console.log(typeof require('./$_'))}catch(e){console.log('ERROR:'+e.message)}" 2>&1
    $color = if ($t -eq "function") { "Green" } else { "Red" }
    Write-Host "$_ -> $t" -ForegroundColor $color
}

Write-Host ""
Write-Host "=== Arrancando servidor ===" -ForegroundColor Cyan
npm run dev
