#!/usr/bin/env node
/**
 * Siembra el catálogo con 210 productos (160 Amazon + 50 Dropi).
 * Uso: node backend/scripts/seed-catalog.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sync.db');
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(path.resolve(DB_PATH));

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); })
  );
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); })
  );
}

function initTable() {
  return new Promise((resolve, reject) =>
    db.run(`CREATE TABLE IF NOT EXISTS catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT, title TEXT, description TEXT,
      price_usd REAL, images TEXT, category TEXT,
      brand TEXT, features TEXT, rating REAL,
      source TEXT DEFAULT 'amazon', supplier_name TEXT,
      supplier_price_cop REAL, status TEXT DEFAULT 'pending',
      fetch_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`, (err) => {
      if (err) reject(err);
      else db.run('CREATE INDEX IF NOT EXISTS idx_catalog_asin ON catalog(asin)', () => resolve());
    })
  );
}

const { ALL_PRODUCTS } = require('../src/data/catalog-products');

async function main() {
  console.log('=== Seed Catálogo Amazon + Dropi (datos curados) ===');
  console.log(`DB: ${path.resolve(DB_PATH)}`);
  console.log(`Productos a insertar: ${ALL_PRODUCTS.length}\n`);

  await initTable();

  const now = new Date().toISOString();
  let inserted = 0, skipped = 0, errors = 0;

  for (const p of ALL_PRODUCTS) {
    const src = p.source || (p.supplier_name === 'Dropi' ? 'dropi' : 'amazon');
    try {
      const existing = p.asin
        ? await dbGet('SELECT id FROM catalog WHERE asin = ?', [p.asin])
        : await dbGet('SELECT id FROM catalog WHERE title = ? AND source = ?', [p.title, src]);
      if (existing) { skipped++; continue; }
      await dbRun(
        `INSERT INTO catalog
           (asin, title, description, price_usd, images, category, brand, features, rating,
            source, supplier_name, supplier_price_cop, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
        [p.asin || null, p.title, p.description, p.price_usd || null,
         JSON.stringify(p.images), p.category, p.brand,
         JSON.stringify(p.features), p.rating,
         src, p.supplier_name || null, p.supplier_price_cop || null, now, now]
      );
      inserted++;
      process.stdout.write('.');
    } catch (err) {
      errors++;
      console.error(`\nError en ${p.asin || p.title}: ${err.message}`);
    }
  }

  const total = await dbGet("SELECT COUNT(*) as cnt FROM catalog WHERE status = 'ready'");
  console.log('\n\n=== Resumen ===');
  console.log(`Insertados: ${inserted} | Omitidos (duplicados): ${skipped} | Errores: ${errors}`);
  console.log(`Total en catálogo (ready): ${total?.cnt || 0}`);
  db.close();
}

main().catch(err => { console.error('Error fatal:', err.message); db.close(); process.exit(1); });
