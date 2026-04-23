const express = require('express');
const router = express.Router();
const { run, get } = require('../database');
const amazonService = require('../services/amazon');
const mlService = require('../services/mercadolibre');

const jobs = new Map();

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const asinIdx = headers.indexOf('asin');
  const markupIdx = headers.indexOf('markup');
  const stockIdx = headers.indexOf('stock');
  if (asinIdx === -1) throw new Error('CSV debe tener columna "asin"');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    rows.push({
      asin: cols[asinIdx] || '',
      markup: markupIdx !== -1 ? parseFloat(cols[markupIdx]) || 20 : 20,
      stock: stockIdx !== -1 ? parseInt(cols[stockIdx]) || 10 : 10,
    });
  }
  return rows.filter(r => r.asin.length >= 10);
}

async function processJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  for (const row of job.rows) {
    try {
      const existing = await get('SELECT id FROM products WHERE asin = ?', [row.asin]);
      if (existing) {
        job.results.push({ asin: row.asin, status: 'skipped', message: 'Ya existe' });
        job.processed++;
        continue;
      }
      const product = await amazonService.getProductByAsin(row.asin);
      const priceCop = mlService.calculatePrice(product.price_usd, { margin: row.markup / 100 });
      const category = await mlService.predictCategory(product.title);
      const now = new Date().toISOString();
      await run(
        `INSERT INTO products (asin,amazon_title,amazon_description,amazon_price_usd,amazon_images,
         amazon_category,amazon_brand,amazon_rating,amazon_features,ml_title,ml_description,
         ml_price_cop,ml_category_id,ml_stock,markup_percent,sync_status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`,
        [row.asin, product.title, product.description, product.price_usd,
         JSON.stringify(product.images), product.category, product.brand,
         product.rating, JSON.stringify(product.features), product.title,
         product.description, priceCop, category?.id || null, row.stock,
         row.markup, now, now]
      );
      job.success++;
      job.results.push({ asin: row.asin, status: 'ok', title: product.title, price_cop: priceCop });
    } catch (err) {
      job.errors++;
      job.results.push({ asin: row.asin, status: 'error', message: err.message });
    }
    job.processed++;
    await new Promise(r => setTimeout(r, 600));
  }
  job.status = 'done';
}

router.post('/import', async (req, res) => {
  try {
    const { csv_data } = req.body;
    if (!csv_data) return res.status(400).json({ error: 'Se requiere csv_data' });
    const rows = parseCSV(csv_data);
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron ASINs válidos' });
    const jobId = Date.now().toString();
    jobs.set(jobId, { id: jobId, total: rows.length, processed: 0, success: 0, errors: 0, results: [], status: 'running', rows });
    processJob(jobId).catch(err => {
      const job = jobs.get(jobId);
      if (job) { job.status = 'error'; job.error = err.message; }
    });
    res.json({ job_id: jobId, total: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
    res.write(`data: ${JSON.stringify({ ...j, rows: undefined })}\n\n`);
    if (j.status === 'done' || j.status === 'error') {
      clearInterval(interval);
      res.end();
    }
  };
  send();
  const interval = setInterval(send, 1000);
  req.on('close', () => clearInterval(interval));
});

router.get('/jobs', (req, res) => {
  const list = Array.from(jobs.values()).map(j => ({
    id: j.id, total: j.total, processed: j.processed,
    success: j.success, errors: j.errors, status: j.status,
  }));
  res.json(list.slice(-20));
});

module.exports = router;
