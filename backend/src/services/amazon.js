const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

/**
 * SERVICIO AMAZON
 * ---------------
 * Dos modos de obtener datos:
 * 1. SP-API (oficial, requiere cuenta vendedor Amazon)
 * 2. Scraping (alternativa, sin credenciales)
 * 
 * RECOMENDADO: SP-API para producción
 * Para pruebas iniciales: scraping
 */

// ─── SP-API Token ──────────────────────────────────────────────
let spApiToken = null;
let tokenExpiry = null;

async function getSpApiToken() {
  if (spApiToken && tokenExpiry && Date.now() < tokenExpiry) {
    return spApiToken;
  }

  const response = await axios.post('https://api.amazon.com/auth/o2/token', {
    grant_type: 'refresh_token',
    refresh_token: process.env.AMAZON_REFRESH_TOKEN,
    client_id: process.env.AMAZON_CLIENT_ID,
    client_secret: process.env.AMAZON_CLIENT_SECRET,
  });

  spApiToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return spApiToken;
}

// ─── Obtener producto via SP-API (oficial) ─────────────────────
async function getProductBySPAPI(asin) {
  const token = await getSpApiToken();
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID || 'A2Q3Y263D00KWC';

  try {
    // Catálogo
    const catalogResponse = await axios.get(
      `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}`,
      {
        headers: {
          'x-amz-access-token': token,
          'Content-Type': 'application/json',
        },
        params: {
          marketplaceIds: marketplaceId,
          includedData: 'attributes,images,productTypes,salesRanks,summaries',
        },
      }
    );

    const item = catalogResponse.data;

    // Precio via Pricing API
    let price = null;
    try {
      const priceResponse = await axios.get(
        `https://sellingpartnerapi-na.amazon.com/products/pricing/v0/price`,
        {
          headers: { 'x-amz-access-token': token },
          params: {
            MarketplaceId: marketplaceId,
            Asins: asin,
            ItemType: 'Asin',
          },
        }
      );
      const priceData = priceResponse.data.payload?.[0]?.Product?.OfferSummary;
      price = parseFloat(priceData?.LowestNewPrice?.Amount || 0);
    } catch (e) {
      logger.warn('No se pudo obtener precio via API:', e.message);
    }

    return normalizeSpApiProduct(item, asin, price);
  } catch (err) {
    logger.info(`SP-API error para ${asin}:`, err.response?.status || err.message);
    throw err;
  }
}

function normalizeSpApiProduct(item, asin, price) {
  const attrs = item.attributes || {};
  const summaries = item.summaries?.[0] || {};
  const images = item.images?.[0]?.images || [];

  return {
    asin,
    title: summaries.itemName || attrs.item_name?.[0]?.value || 'Sin título',
    description: attrs.product_description?.[0]?.value || '',
    price_usd: price,
    images: images.map(img => img.link).filter(Boolean),
    category: summaries.productType || '',
    brand: attrs.brand?.[0]?.value || '',
    rating: null,
    features: (attrs.bullet_point || []).map(b => b.value),
    source: 'sp-api',
  };
}

// ─── Scraping (alternativa sin API key) ────────────────────────
async function getProductByScraping(asin) {
  const url = `https://www.amazon.com/dp/${asin}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  };

  try {
    const { data } = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(data);

    const title = $('#productTitle').text().trim() ||
                  $('h1.a-size-large').text().trim();

    const priceText = $('.a-price-whole').first().text().trim() ||
                      $('#priceblock_ourprice').text().trim() ||
                      $('.a-offscreen').first().text().trim();
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;

    const description = $('#productDescription p').text().trim() ||
                        $('#aplus .aplus-module-wrapper').text().trim().substring(0, 2000);

    const images = [];
    const imgData = $('#imgBlkFront').attr('data-a-dynamic-image') ||
                    $('#landingImage').attr('data-a-dynamic-image');
    if (imgData) {
      try {
        const imgObj = JSON.parse(imgData);
        images.push(...Object.keys(imgObj));
      } catch (e) {}
    }
    // Fallback
    if (images.length === 0) {
      $('#altImages img').each((_, el) => {
        const src = $(el).attr('src') || '';
        const hqSrc = src.replace(/_[A-Z]{2}[0-9]+_/, '_SL1000_');
        if (hqSrc && !hqSrc.includes('play-button')) images.push(hqSrc);
      });
    }

    const features = [];
    $('#feature-bullets li span.a-list-item').each((_, el) => {
      const text = $(el).text().trim();
      if (text) features.push(text);
    });

    const brand = $('#bylineInfo').text().replace('Visitar la tienda de', '').replace('Marca:', '').trim();
    const rating = parseFloat($('#acrPopover').attr('title') || '0') || null;

    if (!title) {
      throw new Error('No se pudo obtener el producto. Intenta con otra URL.');
    }

    return { asin, title, description, price_usd: price, images, category: '', brand, rating, features, source: 'scraping' };
  } catch (err) {
    if (err.message.includes('No se pudo obtener')) throw err;
    throw new Error('No se pudo obtener el producto. Intenta con otra URL.');
  }
}

// ─── Rainforest API ────────────────────────────────────────────
async function getProductByRainforest(asin) {
  const { data } = await axios.get('https://api.rainforestapi.com/request', {
    params: {
      api_key: process.env.RAINFOREST_API_KEY,
      type: 'product',
      asin,
      amazon_domain: 'amazon.com',
    },
    timeout: 20000,
  });

  const p = data.product;
  if (!p || !p.title) throw new Error('No se pudo obtener el producto. Intenta con otra URL.');

  const images = [];
  if (p.main_image?.link) images.push(p.main_image.link);
  if (Array.isArray(p.images)) {
    p.images.forEach(img => { if (img.link && !images.includes(img.link)) images.push(img.link); });
  }

  return {
    asin,
    title: p.title,
    description: p.description || '',
    price_usd: p.buybox_winner?.price?.value || null,
    images,
    category: p.categories?.[0]?.name || '',
    brand: p.brand || '',
    rating: p.rating || null,
    features: Array.isArray(p.feature_bullets) ? p.feature_bullets : [],
    source: 'rainforest',
  };
}

// ─── Función principal: obtiene producto (auto-selecciona método) ─
async function getProductByAsin(asin) {
  asin = extractAsin(asin);
  logger.info(`Buscando producto Amazon: ${asin}`);

  const hasSpApi = process.env.AMAZON_CLIENT_ID &&
    !process.env.AMAZON_CLIENT_ID.includes('XXXXX') &&
    !process.env.AMAZON_CLIENT_ID.includes('XXXXXXXX');

  if (hasSpApi) {
    try {
      return await getProductBySPAPI(asin);
    } catch (err) {
      logger.info(`SP-API falló para ${asin}, intentando siguiente método`);
    }
  }

  const hasRainforest = process.env.RAINFOREST_API_KEY &&
    !process.env.RAINFOREST_API_KEY.includes('XXXXX');

  if (hasRainforest) {
    try {
      return await getProductByRainforest(asin);
    } catch (err) {
      logger.info(`Rainforest falló para ${asin}, usando scraping directo`);
    }
  }

  return await getProductByScraping(asin);
}

// ─── Extraer ASIN de URL o string ─────────────────────────────
function extractAsin(input) {
  if (!input) throw new Error('ASIN requerido');
  input = input.trim();

  // Es URL de Amazon
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
    /^([A-Z0-9]{10})$/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  throw new Error(`No se pudo extraer el ASIN de: "${input}"`);
}

// ─── Obtener precio actual (para actualizaciones) ──────────────
async function getCurrentPrice(asin) {
  try {
    const product = await getProductByAsin(asin);
    return product.price_usd;
  } catch (err) {
    logger.error(`Error obteniendo precio para ${asin}:`, err.message);
    return null;
  }
}

module.exports = { getProductByAsin, getCurrentPrice, extractAsin };
