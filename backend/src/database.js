const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DATABASE_PATH || "./data/sync.db";
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(path.resolve(DB_PATH));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

async function initialize() {
  db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT UNIQUE NOT NULL,
      amazon_title TEXT, amazon_description TEXT,
      amazon_price_usd REAL, amazon_images TEXT,
      amazon_category TEXT, amazon_brand TEXT,
      amazon_rating REAL, amazon_features TEXT,
      ml_item_id TEXT, ml_title TEXT, ml_description TEXT,
      ml_price_cop REAL, ml_category_id TEXT,
      ml_status TEXT DEFAULT "draft",
      ml_condition TEXT DEFAULT "new",
      ml_stock INTEGER DEFAULT 0, ml_images TEXT,
      markup_percent REAL DEFAULT 20,
      min_price_cop REAL DEFAULT 50000,
      sync_status TEXT DEFAULT "pending",
      sync_error TEXT, last_synced_at TEXT,
      ml_account_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    )`);

    // Migration: add ml_account_id if missing
    db.run(`ALTER TABLE products ADD COLUMN ml_account_id INTEGER`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY, value TEXT,
      updated_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER, action TEXT NOT NULL,
      status TEXT NOT NULL, message TEXT,
      old_price REAL, new_price REAL,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ml_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT,
      user_id TEXT UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      site_id TEXT DEFAULT 'MCO',
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS auto_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      keywords TEXT NOT NULL,
      response_template TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      match_type TEXT DEFAULT 'any',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS question_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ml_question_id TEXT UNIQUE,
      item_id TEXT,
      question_text TEXT,
      answer_text TEXT,
      auto_replied INTEGER DEFAULT 0,
      reply_rule_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      alert_type TEXT NOT NULL,
      threshold INTEGER DEFAULT 0,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alert_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER UNIQUE,
      low_stock_threshold INTEGER DEFAULT 5,
      enabled INTEGER DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ml_order_id TEXT UNIQUE,
      ml_item_id TEXT,
      buyer_nickname TEXT,
      total_amount REAL,
      status TEXT,
      shipping_status TEXT,
      order_date TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      phone TEXT,
      name TEXT,
      avatar TEXT,
      google_id TEXT,
      facebook_id TEXT,
      plan TEXT DEFAULT 'trial',
      plan_expires_at TEXT,
      stripe_customer_id TEXT,
      ml_access_token TEXT,
      ml_refresh_token TEXT,
      ml_user_id TEXT,
      rainforest_api_key TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      stripe_subscription_id TEXT,
      status TEXT,
      amount_usd REAL DEFAULT 100,
      current_period_start TEXT,
      current_period_end TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT,
      title TEXT,
      description TEXT,
      price_usd REAL,
      images TEXT,
      category TEXT,
      brand TEXT,
      features TEXT,
      rating REAL,
      source TEXT DEFAULT 'amazon',
      supplier_name TEXT,
      supplier_price_cop REAL,
      status TEXT DEFAULT 'pending',
      fetch_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_catalog_asin ON catalog(asin)');
    db.run('CREATE INDEX IF NOT EXISTS idx_catalog_source ON catalog(source)');
    db.run('CREATE INDEX IF NOT EXISTS idx_catalog_status ON catalog(status)');

    const defaults = [
      ["trm", "4200"], ["ml_commission", "0.11"],
      ["default_margin", "0.20"], ["min_price_cop", "50000"],
      ["sync_frequency", "0 * * * *"], ["auto_update_trm", "true"]
    ];
    const now = new Date().toISOString();
    defaults.forEach(([k, v]) => {
      db.run("INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, ?)", [k, v, now]);
    });
  });
  console.log("Base de datos inicializada");
}

function getConfig(key) {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM config WHERE key = ?", [key], (err, row) => {
      if (err) reject(err); else resolve(row ? row.value : null);
    });
  });
}

function setConfig(key, value) {
  return new Promise((resolve, reject) => {
    db.run("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)",
      [key, String(value), new Date().toISOString()], (err) => { if (err) reject(err); else resolve(); });
  });
}

function logAction({ product_id, action, status, message, old_price, new_price }) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO sync_logs (product_id, action, status, message, old_price, new_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id || null, action, status, message || "", old_price || null, new_price || null, new Date().toISOString()],
      (err) => { if (err) reject(err); else resolve(); });
  });
}

function getDb() { return { run, get, all }; }

module.exports = { initialize, getDb, getConfig, setConfig, logAction, run, get, all };
