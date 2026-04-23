const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database');
const amazonService = require('../services/amazon');
const mlService = require('../services/mercadolibre');

const jobs = new Map();

// GET /api/catalog
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category, source, min_price, max_price } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "WHERE status != 'pending'";
    const params = [];

    if (search) {
      where += " AND (title LIKE ? OR brand LIKE ? OR category LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (source && source !== 'all') {
      where += " AND source = ?";
      params.push(source);
    }
    if (category) {
      where += " AND category LIKE ?";
      params.push(`%${category}%`);
    }
    if (min_price) {
      where += " AND price_usd >= ?";
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      where += " AND price_usd <= ?";
      params.push(parseFloat(max_price));
    }

    const totalRow = await get(`SELECT COUNT(*) as cnt FROM catalog ${where}`, params);
    const rows = await all(
      `SELECT * FROM catalog ${where} ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    res.json({
      products: rows.map(p => ({
        ...p,
        images: JSON.parse(p.images || '[]'),
        features: JSON.parse(p.features || '[]'),
      })),
      total: totalRow?.cnt || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog/categories
router.get('/categories', async (req, res) => {
  try {
    const rows = await all(
      "SELECT DISTINCT category FROM catalog WHERE category IS NOT NULL AND category != '' AND status != 'pending' ORDER BY category"
    );
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog/stats
router.get('/stats', async (req, res) => {
  try {
    const total = await get("SELECT COUNT(*) as cnt FROM catalog WHERE status = 'ready'");
    const amazon = await get("SELECT COUNT(*) as cnt FROM catalog WHERE source = 'amazon' AND status = 'ready'");
    const local = await get("SELECT COUNT(*) as cnt FROM catalog WHERE source = 'local' AND status = 'ready'");
    const pending = await get("SELECT COUNT(*) as cnt FROM catalog WHERE status = 'pending'");
    res.json({
      total: total?.cnt || 0,
      amazon: amazon?.cnt || 0,
      local: local?.cnt || 0,
      pending: pending?.cnt || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog/import-csv
router.post('/import-csv', async (req, res) => {
  try {
    const { csv_data } = req.body;
    if (!csv_data) return res.status(400).json({ error: 'Se requiere csv_data' });

    const lines = csv_data.trim().split(/\r?\n/);
    if (lines.length < 2) return res.status(400).json({ error: 'CSV vacío o sin datos' });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const asinIdx = headers.indexOf('asin');
    const categoryIdx = headers.indexOf('category');
    const brandIdx = headers.indexOf('brand');
    if (asinIdx === -1) return res.status(400).json({ error: 'CSV debe tener columna "asin"' });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
      const asin = cols[asinIdx]?.toUpperCase();
      if (!asin || asin.length < 10) continue;
      rows.push({
        asin,
        category: categoryIdx !== -1 ? cols[categoryIdx] || '' : '',
        brand: brandIdx !== -1 ? cols[brandIdx] || '' : '',
      });
    }
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron ASINs válidos' });

    const now = new Date().toISOString();
    let inserted = 0;
    for (const row of rows) {
      const existing = await get('SELECT id FROM catalog WHERE asin = ?', [row.asin]);
      if (!existing) {
        await run(
          `INSERT INTO catalog (asin, category, brand, source, status, created_at, updated_at) VALUES (?, ?, ?, 'amazon', 'pending', ?, ?)`,
          [row.asin, row.category, row.brand, now, now]
        );
        inserted++;
      }
    }

    const jobId = Date.now().toString();
    jobs.set(jobId, { id: jobId, total: inserted || rows.length, processed: 0, success: 0, errors: 0, status: 'running' });

    enrichCatalogItems(jobId, rows).catch(err => {
      const job = jobs.get(jobId);
      if (job) { job.status = 'error'; job.error = err.message; }
    });

    res.json({ job_id: jobId, total: rows.length, inserted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function enrichCatalogItems(jobId, rows) {
  const job = jobs.get(jobId);
  const BATCH = 5;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    await Promise.all(batch.map(async (row) => {
      try {
        const product = await amazonService.getProductByAsin(row.asin);
        const now = new Date().toISOString();
        await run(
          `UPDATE catalog SET
            title=?, description=?, price_usd=?, images=?,
            brand=COALESCE(NULLIF(?,''),brand), features=?,
            rating=?, status='ready', fetch_error=NULL, updated_at=?
           WHERE asin=?`,
          [
            product.title, product.description || '', product.price_usd || null,
            JSON.stringify(product.images), product.brand || row.brand,
            JSON.stringify(product.features), product.rating || null,
            now, row.asin,
          ]
        );
        job.success++;
      } catch (err) {
        await run(
          `UPDATE catalog SET status='error', fetch_error=?, updated_at=? WHERE asin=?`,
          [err.message, new Date().toISOString(), row.asin]
        );
        job.errors++;
      }
      job.processed++;
    }));

    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, 1000));
  }
  job.status = 'done';
}

// GET /api/catalog/import/:jobId/progress  (SSE)
router.get('/import/:jobId/progress', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    const j = jobs.get(req.params.jobId);
    if (!j) return;
    res.write(`data: ${JSON.stringify(j)}\n\n`);
    if (j.status === 'done' || j.status === 'error') { clearInterval(iv); res.end(); }
  };
  send();
  const iv = setInterval(send, 1000);
  req.on('close', () => clearInterval(iv));
});

// POST /api/catalog/add-local
router.post('/add-local', async (req, res) => {
  try {
    const { title, description, images, supplier_name, supplier_price_cop, category, brand } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es obligatorio' });
    const now = new Date().toISOString();
    const result = await run(
      `INSERT INTO catalog (title, description, images, supplier_name, supplier_price_cop, category, brand, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'local', 'ready', ?, ?)`,
      [title, description || '', JSON.stringify(images || []), supplier_name || '',
       supplier_price_cop || null, category || '', brand || '', now, now]
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog/:id/publish-to-ml
router.post('/:id/publish-to-ml', async (req, res) => {
  try {
    const item = await get('SELECT * FROM catalog WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Producto no encontrado en catálogo' });

    // Deduplicate by ASIN for Amazon products
    if (item.asin) {
      const existing = await get('SELECT id FROM products WHERE asin = ?', [item.asin]);
      if (existing) return res.status(409).json({ error: 'Este producto ya está en tu lista', product_id: existing.id });
    }

    // Local products get a unique placeholder ASIN
    const asin = item.asin || `LOCAL_${item.id}_${Date.now()}`;

    // Determine price in COP
    let priceCop = null;
    if (item.supplier_price_cop) {
      priceCop = Math.round(item.supplier_price_cop * 1.3);
    } else if (item.price_usd) {
      priceCop = mlService.calculatePrice(item.price_usd);
    }

    const now = new Date().toISOString();
    const result = await run(
      `INSERT INTO products
         (asin, amazon_title, amazon_description, amazon_price_usd, amazon_images,
          amazon_category, amazon_brand, amazon_rating, amazon_features,
          ml_title, ml_description, ml_price_cop, sync_status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`,
      [
        asin, item.title, item.description || '', item.price_usd || null,
        item.images || '[]', item.category || '', item.brand || '',
        item.rating || null, item.features || '[]',
        item.title, item.description || '', priceCop,
        now, now,
      ]
    );
    res.json({ success: true, product_id: result.lastInsertRowid, price_cop: priceCop });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
