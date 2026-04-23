/**
 * Seeds the catalog table with Amazon bestsellers via Rainforest API.
 * Run: node src/scripts/seedCatalog.js
 *
 * Downloads top items from 8 categories and inserts them as 'ready' status.
 * Requires RAINFOREST_API_KEY in .env
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const { initialize, run, get } = require('../database');

const CATEGORIES = [
  { url: 'https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics/', name: 'Electronics' },
  { url: 'https://www.amazon.com/Best-Sellers-Computers/zgbs/pc/', name: 'Computers' },
  { url: 'https://www.amazon.com/Best-Sellers-Cell-Phones-Accessories/zgbs/wireless/', name: 'Cell Phones' },
  { url: 'https://www.amazon.com/Best-Sellers-Home-Kitchen/zgbs/home-garden/', name: 'Home & Kitchen' },
  { url: 'https://www.amazon.com/Best-Sellers-Sports-Outdoors/zgbs/sporting-goods/', name: 'Sports' },
  { url: 'https://www.amazon.com/Best-Sellers-Toys-Games/zgbs/toys-and-games/', name: 'Toys' },
  { url: 'https://www.amazon.com/Best-Sellers-Beauty-Personal-Care/zgbs/beauty/', name: 'Beauty' },
  { url: 'https://www.amazon.com/Best-Sellers-Books/zgbs/books/', name: 'Books' },
];

const API_KEY = process.env.RAINFOREST_API_KEY;
if (!API_KEY) { console.error('RAINFOREST_API_KEY no configurado en .env'); process.exit(1); }

async function fetchBestsellers(category) {
  const { data } = await axios.get('https://api.rainforestapi.com/request', {
    params: {
      api_key: API_KEY,
      type: 'bestsellers',
      url: category.url,
    },
    timeout: 30000,
  });
  return (data.bestsellers || []).slice(0, 12);
}

async function seed() {
  // Wait for DB to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  initialize();
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`\nSeeding catalog from Rainforest API (${CATEGORIES.length} categories)...\n`);
  let total = 0;
  let inserted = 0;

  for (const cat of CATEGORIES) {
    try {
      console.log(`Fetching ${cat.name}...`);
      const items = await fetchBestsellers(cat);
      console.log(`  Found ${items.length} items`);

      for (const item of items) {
        total++;
        const asin = item.asin;
        if (!asin) continue;

        const existing = await get('SELECT id FROM catalog WHERE asin = ?', [asin]);
        if (existing) { console.log(`  SKIP ${asin} (already exists)`); continue; }

        const images = [];
        if (item.image) images.push(item.image);

        const now = new Date().toISOString();
        await run(
          `INSERT INTO catalog (asin, title, price_usd, images, category, brand, rating, source, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'amazon', 'ready', ?, ?)`,
          [
            asin,
            item.title || '',
            item.price?.value || null,
            JSON.stringify(images),
            cat.name,
            item.brand || '',
            item.rating || null,
            now, now,
          ]
        );
        inserted++;
        console.log(`  + ${asin} — ${(item.title || '').slice(0, 50)}`);
      }

      // Pause between categories to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ERROR fetching ${cat.name}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${inserted}/${total} products inserted.\n`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
