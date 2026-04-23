const axios = require('axios');
const { getConfig, setConfig, logAction } = require('../database');
const logger = require('../utils/logger');

const ML_API = 'https://api.mercadolibre.com';

// ─── Token management ─────────────────────────────────────────
let accessToken = process.env.ML_ACCESS_TOKEN || null;
let tokenExpiry = null;

async function getToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  // Si no hay token en memoria, intentar cargar desde DB
  if (!accessToken) {
    const dbToken = await getConfig('ml_access_token');
    if (dbToken && !dbToken.startsWith('APP_USR-XXXXX')) {
      accessToken = dbToken;
      process.env.ML_ACCESS_TOKEN = dbToken;
      tokenExpiry = Date.now() + 3 * 60 * 60 * 1000; // asumir 3h válido
      return accessToken;
    }
  }
  await refreshToken();
  return accessToken;
}

async function refreshToken() {
  // Buscar en env primero, luego en DB
  let refreshTk = process.env.ML_REFRESH_TOKEN;
  if (!refreshTk || refreshTk.startsWith('TG-XXX')) {
    refreshTk = await getConfig('ml_refresh_token');
  }
  if (!refreshTk || refreshTk.startsWith('TG-XXX')) {
    throw new Error('ML_REFRESH_TOKEN no configurado. Ve a /api/auth/ml para autenticarte.');
  }

  try {
    const { data } = await axios.post(`${ML_API}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: process.env.ML_APP_ID,
      client_secret: process.env.ML_SECRET_KEY,
      refresh_token: refreshTk,
    });

    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    process.env.ML_ACCESS_TOKEN = data.access_token;
    process.env.ML_REFRESH_TOKEN = data.refresh_token;
    setConfig('ml_access_token', data.access_token);
    setConfig('ml_refresh_token', data.refresh_token);

    logger.info('✅ Token de Mercado Libre renovado');
  } catch (err) {
    logger.error('Error renovando token ML:', err.response?.data || err.message);
    throw new Error('No se pudo renovar el token de Mercado Libre. Reautenticate en /api/auth/ml');
  }
}

// ─── HTTP helper ──────────────────────────────────────────────
async function mlRequest(method, path, data = null, params = null) {
  const token = await getToken();
  try {
    const response = await axios({
      method,
      url: `${ML_API}${path}`,
      headers: { Authorization: `Bearer ${token}` },
      data,
      params,
    });
    return response.data;
  } catch (err) {
    const mlError = err.response?.data;
    console.log('ML ERROR:', JSON.stringify(mlError, null, 2));
    logger.error(`ML API Error ${method} ${path}:`, mlError || err.message);
    
    if (err.response?.status === 401) {
      // Token expirado, intentar renovar
      await refreshToken();
      const newToken = await getToken();
      const retry = await axios({
        method, url: `${ML_API}${path}`,
        headers: { Authorization: `Bearer ${newToken}` },
        data, params,
      });
      return retry.data;
    }
    
    throw new Error(mlError?.message || mlError?.error || err.message);
  }
}

// ─── Información del usuario ──────────────────────────────────
async function getMe() {
  return await mlRequest('get', '/users/me');
}

// ─── Buscar categoría en ML ───────────────────────────────────
async function predictCategory(title) {
  const siteId = process.env.ML_SITE_ID || 'MCO';
  try {
    const { data } = await axios.get(`${ML_API}/sites/${siteId}/domain_discovery/search`, {
      params: { q: title, limit: 5 }
    });
    if (data && data.length > 0) {
      return { id: data[0].category_id, name: data[0].category_name };
    }
    return null;
  } catch (e) {
    logger.warn('No se pudo predecir categoría:', e.message);
    return null;
  }
}

// ─── Subir imagen a ML ────────────────────────────────────────
async function uploadImage(imageUrl) {
  const token = await getToken();
  try {
    // Descargar imagen
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imgResponse.data);

    // Subir a ML
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buffer, {
      filename: 'product.jpg',
      contentType: imgResponse.headers['content-type'] || 'image/jpeg',
    });

    const { data } = await axios.post(`${ML_API}/pictures/items/upload`, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
    });

    logger.info(`Imagen subida: ${data.id}`);
    return data.id;
  } catch (err) {
    logger.error('Error subiendo imagen:', err.message);
    return null;
  }
}

async function uploadImages(imageUrls) {
  const ids = [];
  for (const url of imageUrls.slice(0, 10)) { // ML acepta hasta 10 imágenes
    const id = await uploadImage(url);
    if (id) ids.push({ id });
  }
  return ids;
}

// ─── Publicar producto en ML ──────────────────────────────────
async function publishProduct(productData) {
  const {
    title,
    description,
    price_cop,
    category_id: rawCategoryId,
    catalog_product_id: rawCatalogProductId,
    ml_condition = 'new',
    stock = 10,
    image_urls = [],
    attributes: rawAttributes = [],
    brand,
  } = productData;

  // 1. Resolver categoría
  let category_id = rawCategoryId;
  if (!category_id) {
    logger.info('Sin category_id, prediciendo categoría para: ' + title);
    const predicted = await predictCategory(title);
    if (predicted) {
      category_id = predicted.id;
      logger.info(`Categoría predicha: ${predicted.name} (${category_id})`);
    } else {
      throw new Error('No se pudo determinar la categoría de ML. Provee ml_category_id manualmente.');
    }
  }

  // 2. family_name: requerido a nivel raíz en ML Colombia (MCO)
  const resolvedBrand = brand || 'Genérico';
  const familyName = (brand && brand !== 'Genérico') ? brand : title.split(' ').slice(0, 3).join(' ');

  // 3. Atributos mínimos requeridos
  const attributes = [...rawAttributes];
  if (!attributes.find(a => a.id === 'BRAND')) {
    attributes.push({ id: 'BRAND', value_name: resolvedBrand });
  }
  if (!attributes.find(a => a.id === 'MODEL')) {
    const modelName = title.replace(/licuadora\s*portátil\s*/i, '').trim() || 'LB-400';
    attributes.push({ id: 'MODEL', value_name: modelName.slice(0, 30) });
  }
  if (!attributes.find(a => a.id === 'POWER_SUPPLY_TYPE')) {
    const isBattery = /usb|recargable|batería|battery/i.test(title + ' ' + (description || ''));
    attributes.push({ id: 'POWER_SUPPLY_TYPE', value_id: isBattery ? '4491927' : '49713698', value_name: isBattery ? 'Batería' : 'Corriente doméstica' });
  }

  // 4. Resolver catalog_product_id: ML Colombia requiere modo catálogo con family_name
  let catalog_product_id = rawCatalogProductId;
  if (!catalog_product_id) {
    logger.info('Buscando catalog_product_id para: ' + title);
    try {
      const token = await getToken();
      const siteId = process.env.ML_SITE_ID || 'MCO';
      const { data } = await axios.get(`${ML_API}/products/search`, {
        params: { site_id: siteId, q: title, limit: 5, status: 'active' },
        headers: { Authorization: `Bearer ${token}` },
      });
      const match = data?.results?.[0];
      if (match) {
        catalog_product_id = match.id;
        logger.info(`catalog_product_id encontrado: ${catalog_product_id} (${match.name})`);
      }
    } catch (e) {
      logger.warn('No se pudo buscar catalog_product_id:', e.message);
    }
  }

  // 5. Resolver imágenes: subir las propias o usar las del catálogo
  let pictures;
  if (image_urls.length > 0) {
    logger.info(`Subiendo ${image_urls.length} imágenes a ML...`);
    const uploaded = await uploadImages(image_urls);
    if (uploaded.length > 0) pictures = uploaded;
  }
  if (!pictures && catalog_product_id) {
    // Reutilizar imágenes del catalog product (evita error requiresPictures en free listing)
    try {
      const token = await getToken();
      const { data: catProd } = await axios.get(`${ML_API}/products/${catalog_product_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (catProd?.pictures?.length > 0) {
        pictures = catProd.pictures.slice(0, 3).map(p => ({ source: p.url }));
        logger.info(`Usando ${pictures.length} imágenes del catalog product`);
      }
    } catch (e) {
      logger.warn('No se pudieron obtener imágenes del catálogo:', e.message);
    }
  }

  if (!pictures) {
    throw new Error('No hay imágenes para publicar y no se encontró un catalog_product_id con imágenes. Agrega image_urls al producto o especifica catalog_product_id.');
  }

  // 6. Publicar en modo catálogo (con family_name en raíz — requerido por ML Colombia)
  const listing = {
    ...(catalog_product_id && { catalog_product_id }),
    category_id,
    family_name: familyName.slice(0, 60),
    price: Math.round(price_cop),
    currency_id: 'COP',
    available_quantity: stock,
    buying_mode: 'buy_it_now',
    listing_type_id: 'free',
    condition: ml_condition,
    pictures,
    attributes,
    ...(description && { description: { plain_text: description } }),
    shipping: {
      mode: 'me2',
      local_pick_up: false,
      free_shipping: false,
    },
  };

  logger.info('Publicando en Mercado Libre...');
  console.log('ML BODY:', JSON.stringify(listing, null, 2));
  const result = await mlRequest('post', '/items', listing);
  logger.info(`✅ Publicado en ML: ${result.id}`);

  return {
    ml_item_id: result.id,
    ml_permalink: result.permalink,
    ml_status: result.status,
  };
}

// ─── Actualizar precio en ML ──────────────────────────────────
async function updatePrice(mlItemId, newPriceCop) {
  return await mlRequest('put', `/items/${mlItemId}`, {
    price: Math.round(newPriceCop),
  });
}

// ─── Actualizar stock en ML ───────────────────────────────────
async function updateStock(mlItemId, quantity) {
  return await mlRequest('put', `/items/${mlItemId}`, {
    available_quantity: quantity,
  });
}

// ─── Pausar / Reactivar publicación ──────────────────────────
async function pauseItem(mlItemId) {
  return await mlRequest('put', `/items/${mlItemId}`, { status: 'paused' });
}

async function activateItem(mlItemId) {
  return await mlRequest('put', `/items/${mlItemId}`, { status: 'active' });
}

// ─── Obtener publicación ──────────────────────────────────────
async function getItem(mlItemId) {
  return await mlRequest('get', `/items/${mlItemId}`);
}

// ─── Listar publicaciones del vendedor ────────────────────────
async function getMyItems(offset = 0, limit = 50) {
  const me = await getMe();
  const userId = me.id;
  const siteId = process.env.ML_SITE_ID || 'MCO';

  const data = await mlRequest('get', `/users/${userId}/items/search`, null, {
    status: 'active',
    offset,
    limit,
  });

  return {
    items: data.results || [],
    total: data.paging?.total || 0,
    offset: data.paging?.offset || 0,
  };
}

// ─── Obtener TRM actual ───────────────────────────────────────
async function getCurrentTRM() {
  try {
    // API pública del Banco de la República de Colombia
    const { data } = await axios.get(
      'https://www.datos.gov.co/resource/mcec-87by.json?$limit=1&$order=vigenciadesde DESC',
      { timeout: 5000 }
    );
    if (data && data[0]) {
      const trm = parseFloat(data[0].valor);
      logger.info(`TRM actualizada: $${trm}`);
      return trm;
    }
  } catch (err) {
    logger.warn('No se pudo obtener TRM del Banco de la República:', err.message);
  }

  // Fallback a configuración guardada
  const savedTrm = await getConfig('trm');
  return parseFloat(savedTrm) || configCache.trm || 4200;
}

// ─── Calcular precio ML ───────────────────────────────────────
// configCache is populated by loadConfig() at startup and after config updates
let configCache = {};
async function loadConfig() {
  try {
    configCache.trm = parseFloat(await getConfig('trm') || process.env.TRM_DEFAULT || '4200');
    configCache.margin = parseFloat(await getConfig('default_margin') || process.env.DEFAULT_MARGIN || '0.20');
    configCache.commission = parseFloat(await getConfig('ml_commission') || process.env.ML_COMMISSION || '0.11');
    configCache.minPriceCop = parseFloat(await getConfig('min_price_cop') || process.env.MIN_PRICE_COP || '50000');
  } catch (e) { /* use env defaults */ }
}
loadConfig();

function calculatePrice(priceUsd, options = {}) {
  const {
    trm = configCache.trm || parseFloat(process.env.TRM_DEFAULT || '4200'),
    margin = configCache.margin || parseFloat(process.env.DEFAULT_MARGIN || '0.20'),
    commission = configCache.commission || parseFloat(process.env.ML_COMMISSION || '0.11'),
    minPriceCop = configCache.minPriceCop || parseFloat(process.env.MIN_PRICE_COP || '50000'),
    extraFixed = 0,
  } = options;

  if (!priceUsd || isNaN(priceUsd)) return null;

  const baseCop = priceUsd * trm;
  const withMargin = baseCop * (1 + margin);
  const withCommission = withMargin / (1 - commission);
  const finalPrice = withCommission + extraFixed;

  return Math.max(Math.round(finalPrice), minPriceCop);
}

// ─── Órdenes ──────────────────────────────────────────────────
async function getOrders(offset = 0, limit = 50) {
  const me = await getMe();
  const userId = me.id;
  return await mlRequest('get', `/orders/search`, null, {
    seller: userId,
    offset,
    limit,
    sort: 'date_desc',
  });
}

// ─── Preguntas ────────────────────────────────────────────────
async function getQuestions(status = 'UNANSWERED', offset = 0, limit = 50) {
  const me = await getMe();
  const userId = me.id;
  return await mlRequest('get', `/questions/search`, null, {
    seller_id: userId,
    status,
    offset,
    limit,
    sort_fields: 'date_created',
    sort_types: 'DESC',
  });
}

async function answerQuestion(questionId, text) {
  return await mlRequest('post', `/answers`, {
    question_id: questionId,
    text,
  });
}

// ─── Búsqueda de competencia ──────────────────────────────────
async function searchByTitle(query, limit = 10) {
  const siteId = process.env.ML_SITE_ID || 'MCO';
  try {
    const { data } = await axios.get(`${ML_API}/sites/${siteId}/search`, {
      params: { q: query, limit },
    });
    return data.results || [];
  } catch (e) {
    logger.warn('Error buscando competencia:', e.message);
    return [];
  }
}

module.exports = {
  getMe,
  predictCategory,
  uploadImage,
  uploadImages,
  publishProduct,
  updatePrice,
  updateStock,
  pauseItem,
  activateItem,
  getItem,
  getMyItems,
  getCurrentTRM,
  calculatePrice,
  loadConfig,
  refreshToken,
  getOrders,
  getQuestions,
  answerQuestion,
  searchByTitle,
};
