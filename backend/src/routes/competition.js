const express = require('express');
const router = express.Router();
const { get, run } = require('../database');
const mlService = require('../services/mercadolibre');

router.get('/:productId', async (req, res) => {
  try {
    const product = await get('SELECT * FROM products WHERE id = ?', [req.params.productId]);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const title = product.ml_title || product.amazon_title;
    const results = await mlService.searchByTitle(title, 12);
    const competitors = results
      .filter(r => r.id !== product.ml_item_id)
      .map(r => ({
        id: r.id,
        title: r.title,
        price: r.price,
        currency_id: r.currency_id,
        seller_id: r.seller?.id,
        seller_nickname: r.seller?.nickname,
        permalink: r.permalink,
        thumbnail: r.thumbnail,
        available_quantity: r.available_quantity,
        sold_quantity: r.sold_quantity,
        condition: r.condition,
      }))
      .sort((a, b) => a.price - b.price);
    const ourPrice = product.ml_price_cop;
    const lowestPrice = competitors.length > 0 ? competitors[0].price : null;
    res.json({
      product: { id: product.id, ml_item_id: product.ml_item_id, title, price: ourPrice },
      competitors,
      lowest_price: lowestPrice,
      is_cheapest: !lowestPrice || ourPrice <= lowestPrice,
      price_diff: lowestPrice ? ourPrice - lowestPrice : 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:productId/match-price', async (req, res) => {
  try {
    const product = await get('SELECT * FROM products WHERE id = ?', [req.params.productId]);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    if (!product.ml_item_id) return res.status(400).json({ error: 'Producto no publicado en ML' });
    const title = product.ml_title || product.amazon_title;
    const results = await mlService.searchByTitle(title, 12);
    const competitors = results
      .filter(r => r.id !== product.ml_item_id)
      .sort((a, b) => a.price - b.price);
    if (competitors.length === 0) return res.status(400).json({ error: 'No hay competidores encontrados' });
    const newPrice = Math.max(competitors[0].price - 1, product.min_price_cop || 50000);
    await mlService.updatePrice(product.ml_item_id, newPrice);
    await run('UPDATE products SET ml_price_cop=?, updated_at=? WHERE id=?',
      [newPrice, new Date().toISOString(), product.id]);
    res.json({ success: true, old_price: product.ml_price_cop, new_price: newPrice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
