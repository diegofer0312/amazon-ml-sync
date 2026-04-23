const { run, get, all, logAction, getConfig, setConfig } = require('../database');
const amazonService = require('../services/amazon');
const mlService = require('../services/mercadolibre');
const logger = require('../utils/logger');

async function syncAllPrices() {
  const stats = { total: 0, updated: 0, skipped: 0, errors: 0 };

  if ((await getConfig('auto_update_trm')) === 'true') {
    try {
      const trm = await mlService.getCurrentTRM();
      await setConfig('trm', trm.toString());
      logger.info(`TRM actualizada: $${trm}`);
    } catch (e) {
      logger.warn('No se pudo actualizar TRM automáticamente');
    }
  }

  const products = await all(
    "SELECT * FROM products WHERE sync_status = 'synced' AND ml_item_id IS NOT NULL AND ml_status = 'active'"
  );

  logger.info(`Sincronizando precios de ${products.length} productos...`);
  stats.total = products.length;

  for (const product of products) {
    try {
      const newAmazonPrice = await amazonService.getCurrentPrice(product.asin);
      if (!newAmazonPrice) { stats.skipped++; continue; }

      const newPriceCop = mlService.calculatePrice(newAmazonPrice, {
        markup: product.markup_percent / 100,
        minPriceCop: product.min_price_cop,
      });

      const priceDiff = Math.abs(newPriceCop - product.ml_price_cop) / (product.ml_price_cop || 1);
      if (priceDiff < 0.005) { stats.skipped++; continue; }

      await mlService.updatePrice(product.ml_item_id, newPriceCop);

      const now = new Date().toISOString();
      await run(
        'UPDATE products SET amazon_price_usd=?, ml_price_cop=?, last_synced_at=?, updated_at=? WHERE id=?',
        [newAmazonPrice, newPriceCop, now, now, product.id]
      );

      await logAction({
        product_id: product.id,
        action: 'price_update',
        status: 'ok',
        message: `$${product.ml_price_cop?.toLocaleString()} → $${newPriceCop.toLocaleString()} COP`,
        old_price: product.ml_price_cop,
        new_price: newPriceCop,
      });

      stats.updated++;
      logger.info(`✅ ${product.asin} → $${newPriceCop.toLocaleString()} COP`);
      await sleep(1000);

    } catch (err) {
      stats.errors++;
      logger.error(`❌ Error ${product.asin}:`, err.message);
      await run('UPDATE products SET sync_error=?, updated_at=? WHERE id=?',
        [err.message, new Date().toISOString(), product.id]);
      await logAction({ product_id: product.id, action: 'price_update', status: 'error', message: err.message });
    }
  }

  logger.info(`Sync: ${stats.updated} actualizados, ${stats.skipped} sin cambios, ${stats.errors} errores`);
  return stats;
}

async function publishPendingProducts() {
  const pending = await all(
    "SELECT * FROM products WHERE sync_status = 'pending' AND ml_title IS NOT NULL LIMIT 10"
  );

  const results = [];

  for (const product of pending) {
    try {
      const images = JSON.parse(product.amazon_images || '[]');
      const categoryResult = await mlService.predictCategory(product.ml_title || product.amazon_title);

      const mlResult = await mlService.publishProduct({
        title: product.ml_title || product.amazon_title,
        description: product.ml_description || product.amazon_description,
        price_cop: product.ml_price_cop,
        category_id: product.ml_category_id || categoryResult?.id,
        ml_condition: product.ml_condition || 'new',
        stock: product.ml_stock || 10,
        image_urls: images,
      });

      const now = new Date().toISOString();
      await run(
        "UPDATE products SET ml_item_id=?, ml_status='active', sync_status='synced', sync_error=NULL, last_synced_at=?, updated_at=? WHERE id=?",
        [mlResult.ml_item_id, now, now, product.id]
      );

      await logAction({ product_id: product.id, action: 'publish', status: 'ok',
        message: `Publicado en ML: ${mlResult.ml_item_id}`, new_price: product.ml_price_cop });

      results.push({ asin: product.asin, ml_item_id: mlResult.ml_item_id, status: 'ok' });
      await sleep(2000);

    } catch (err) {
      logger.error(`Error publicando ${product.asin}:`, err.message);
      await run('UPDATE products SET sync_status=\'error\', sync_error=? WHERE id=?', [err.message, product.id]);
      results.push({ asin: product.asin, error: err.message, status: 'error' });
    }
  }

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { syncAllPrices, publishPendingProducts };
