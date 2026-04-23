import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const API = axios.create({ baseURL: BASE_URL, timeout: 30000 });

// Adjunta JWT en cada request
API.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    const msg = err.response?.data?.error || err.message || 'Error de conexión';
    return Promise.reject(new Error(msg));
  }
);

export const userAuthApi = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  loginGoogle: (credential) => API.post('/auth/google', { credential }),
  me: () => API.get('/auth/me'),
  logout: () => API.post('/auth/logout'),
  sendOtp: (phone) => API.post('/auth/phone', { phone }),
  verifyOtp: (phone, otp) => API.post('/auth/verify-otp', { phone, otp }),
};

export const paymentsApi = {
  createCheckout: () => API.post('/payments/create-checkout'),
  getStatus: () => API.get('/payments/status'),
  openPortal: () => API.post('/payments/portal'),
};

export const productsApi = {
  list: (params) => API.get('/products', { params }),
  get: (id) => API.get(`/products/${id}`),
  import: (asin_or_url) => API.post('/products/import', { asin_or_url }),
  update: (id, data) => API.put(`/products/${id}`, data),
  publish: (id) => API.post(`/products/${id}/publish`),
  pause: (id) => API.post(`/products/${id}/pause`),
  delete: (id) => API.delete(`/products/${id}`),
  getLogs: (id) => API.get(`/products/${id}/logs`),
  bulkPrice: (data) => API.post('/products/bulk-price', data),
};

export const syncApi = {
  syncPrices: () => API.post('/sync/prices'),
  publishPending: () => API.post('/sync/publish-pending'),
  getLogs: (params) => API.get('/sync/logs', { params }),
  getStats: () => API.get('/sync/stats'),
};

export const configApi = {
  get: () => API.get('/config'),
  update: (data) => API.put('/config', data),
  getTRM: () => API.get('/config/trm'),
  getPriceRules: () => API.get('/config/price-rules'),
  createPriceRule: (data) => API.post('/config/price-rules', data),
};

export const authApi = {
  getStatus: () => API.get('/auth/status'),
  getMlAuthUrl: () => API.get('/auth/ml'),
};

export const csvApi = {
  import: (csv_data) => API.post('/csv/import', { csv_data }),
  progressUrl: (jobId) => `${BASE_URL}/csv/import/${jobId}/progress`,
  getJobs: () => API.get('/csv/jobs'),
};

export const questionsApi = {
  list: (params) => API.get('/questions', { params }),
  getRules: () => API.get('/questions/rules'),
  createRule: (data) => API.post('/questions/rules', data),
  updateRule: (id, data) => API.put(`/questions/rules/${id}`, data),
  deleteRule: (id) => API.delete(`/questions/rules/${id}`),
  reply: (questionId, text) => API.post(`/questions/${questionId}/reply`, { text }),
  autoCheck: () => API.post('/questions/auto-check'),
  getLogs: () => API.get('/questions/logs'),
};

export const competitionApi = {
  get: (productId) => API.get(`/competition/${productId}`),
  matchPrice: (productId) => API.post(`/competition/${productId}/match-price`),
};

export const ordersApi = {
  list: (params) => API.get('/orders', { params }),
  refresh: () => API.post('/orders/refresh'),
};

export const alertsApi = {
  list: (params) => API.get('/alerts', { params }),
  getUnreadCount: () => API.get('/alerts/unread-count'),
  markRead: (id) => API.put(`/alerts/${id}/read`),
  markAllRead: () => API.put('/alerts/read-all'),
  delete: (id) => API.delete(`/alerts/${id}`),
  checkStock: () => API.post('/alerts/check-stock'),
  getConfig: () => API.get('/alerts/config'),
  setConfig: (productId, data) => API.put(`/alerts/config/${productId}`, data),
};

export const reportsApi = {
  getSummary: () => API.get('/reports/summary'),
  getSalesByDay: () => API.get('/reports/sales-by-day'),
  getTopProducts: () => API.get('/reports/top-products'),
  getPriceComparison: () => API.get('/reports/price-comparison'),
};

export const catalogApi = {
  list: (params) => API.get('/catalog', { params }),
  getCategories: () => API.get('/catalog/categories'),
  getStats: () => API.get('/catalog/stats'),
  importCsv: (csv_data) => API.post('/catalog/import-csv', { csv_data }),
  progressUrl: (jobId) => `${BASE_URL}/catalog/import/${jobId}/progress`,
  addLocal: (data) => API.post('/catalog/add-local', data),
  publishToMl: (id) => API.post(`/catalog/${id}/publish-to-ml`),
};

export const mlAccountsApi = {
  list: () => API.get('/ml-accounts'),
  getAuthUrl: () => API.get('/ml-accounts/auth-url'),
  activate: (id) => API.put(`/ml-accounts/${id}/activate`),
  delete: (id) => API.delete(`/ml-accounts/${id}`),
};

export function formatCOP(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

export function formatUSD(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(value);
}

export function timeAgo(dateStr) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)} días`;
}

export const STATUS_LABELS = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  synced: { label: 'Sincronizado', color: 'bg-green-100 text-green-700' },
  error: { label: 'Error', color: 'bg-red-100 text-red-700' },
  paused: { label: 'Pausado', color: 'bg-blue-100 text-blue-700' },
};

export const ORDER_STATUS = {
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-700' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  in_process: { label: 'En proceso', color: 'bg-purple-100 text-purple-700' },
};
