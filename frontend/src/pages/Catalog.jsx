import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi, formatCOP, formatUSD } from '../services/api';
import { Search, Upload, Plus, ShoppingCart, Filter, Star, Package, AlertCircle, CheckCircle, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';

const SOURCE_TABS = [
  { value: 'all', label: 'Todos' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'local', label: 'Dropi' },
];

const STATUS_BADGE = {
  ready:   { label: 'Listo',    cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Cargando', cls: 'bg-yellow-100 text-yellow-700' },
  error:   { label: 'Error',    cls: 'bg-red-100 text-red-700' },
};

function ProductCard({ product, onPublish, publishing }) {
  const image = product.images?.[0];
  const badge = STATUS_BADGE[product.status] || STATUS_BADGE.ready;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      <div className="h-44 bg-gray-50 flex items-center justify-center overflow-hidden relative">
        {image
          ? <img src={image} alt={product.title} className="h-full w-full object-contain p-2" onError={e => { e.target.style.display='none'; }} />
          : <Package className="w-16 h-16 text-gray-300" />}
        {product.source === 'local' && (
          <span
            className="absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: '#FFD100', color: '#000', letterSpacing: '0.02em' }}
          >
            dropi
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <div className="flex items-start justify-between gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
          {product.source === 'amazon' && (
            <span className="text-xs text-gray-400">🇺🇸 Amazon</span>
          )}
        </div>
        <h3 className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">{product.title || product.asin}</h3>
        {product.brand && <p className="text-xs text-gray-500">{product.brand}</p>}
        {product.category && <p className="text-xs text-gray-400 truncate">{product.category}</p>}
        <div className="mt-1 flex items-center gap-2">
          {product.price_usd && <span className="text-sm font-semibold text-blue-700">{formatUSD(product.price_usd)}</span>}
          {product.supplier_price_cop && <span className="text-sm font-semibold text-green-700">{formatCOP(product.supplier_price_cop)}</span>}
          {product.rating && (
            <span className="flex items-center gap-0.5 text-xs text-yellow-500 ml-auto">
              <Star className="w-3 h-3 fill-yellow-400" />{product.rating}
            </span>
          )}
        </div>
        {product.status === 'ready' && (
          <button
            onClick={() => onPublish(product.id)}
            disabled={publishing === product.id}
            className="mt-2 w-full flex items-center justify-center gap-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-xs font-semibold py-1.5 rounded-lg disabled:opacity-60 transition-colors"
          >
            {publishing === product.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ShoppingCart className="w-3.5 h-3.5" />}
            Publicar en ML
          </button>
        )}
        {product.status === 'error' && product.fetch_error && (
          <p className="mt-1 text-xs text-red-500 truncate" title={product.fetch_error}>{product.fetch_error}</p>
        )}
      </div>
    </div>
  );
}

function ImportCsvModal({ onClose, onDone }) {
  const [csvText, setCsvText] = useState('');
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const esRef = useRef(null);

  const importMut = useMutation({
    mutationFn: () => catalogApi.importCsv(csvText),
    onSuccess: (data) => {
      setJobId(data.job_id);
      const url = catalogApi.progressUrl(data.job_id);
      esRef.current = new EventSource(url);
      esRef.current.onmessage = (e) => {
        const j = JSON.parse(e.data);
        setProgress(j);
        if (j.status === 'done' || j.status === 'error') {
          esRef.current.close();
          if (j.status === 'done') onDone();
        }
      };
    },
    onError: (e) => setError(e.message),
  });

  const handleClose = () => {
    esRef.current?.close();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">Importar ASINs desde CSV</h2>
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {!progress ? (
            <>
              <p className="text-sm text-gray-600">Pega el contenido CSV con columnas: <code className="bg-gray-100 px-1 rounded">asin</code>, <code className="bg-gray-100 px-1 rounded">category</code> (opcional), <code className="bg-gray-100 px-1 rounded">brand</code> (opcional)</p>
              <p className="text-xs text-gray-400">Ejemplo: <br/><code className="bg-gray-50 block p-2 rounded mt-1">asin,category,brand<br/>B08N5WRWNW,Electronics,Sony<br/>B07XJ8C8F7,Headphones,JBL</code></p>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder="Pega el CSV aquí..."
                rows={8}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>}
              <button
                onClick={() => importMut.mutate()}
                disabled={!csvText.trim() || importMut.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {importMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar y enriquecer
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progreso</span>
                <span className="font-medium">{progress.processed} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${progress.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}
                  style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">✓ {progress.success} exitosos</span>
                <span className="text-red-500">✗ {progress.errors} errores</span>
              </div>
              {progress.status === 'done' && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">¡Importación completa!</span>
                </div>
              )}
              {progress.status === 'error' && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                  <span>{progress.error || 'Error en la importación'}</span>
                </div>
              )}
              {(progress.status === 'done' || progress.status === 'error') && (
                <button onClick={handleClose} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg">Cerrar</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Catalog() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const [publishMsg, setPublishMsg] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const LIMIT = 24;

  const params = { page, limit: LIMIT, source, ...(search && { search }), ...(category && { category }), ...(minPrice && { min_price: minPrice }), ...(maxPrice && { max_price: maxPrice }) };

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', params],
    queryFn: () => catalogApi.list(params),
    keepPreviousData: true,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: catalogApi.getCategories,
  });

  const { data: stats } = useQuery({
    queryKey: ['catalog-stats'],
    queryFn: catalogApi.getStats,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const handlePublish = async (id) => {
    setPublishing(id);
    setPublishMsg(null);
    try {
      const result = await catalogApi.publishToMl(id);
      setPublishMsg({ type: 'success', text: `Producto añadido a tu lista (ID: ${result.product_id})` });
      queryClient.invalidateQueries(['catalog']);
    } catch (e) {
      setPublishMsg({ type: 'error', text: e.message });
    } finally {
      setPublishing(null);
    }
  };

  const resetFilters = () => {
    setSearch(''); setCategory(''); setMinPrice(''); setMaxPrice(''); setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo Masivo</h1>
          {stats && (
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.total} productos listos · {stats.amazon} Amazon · {stats.local} Dropi
              {stats.pending > 0 && <span className="text-yellow-600"> · {stats.pending} cargando...</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <a href="/add-local-product" className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />Producto Dropi
          </a>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />Importar CSV
          </button>
        </div>
      </div>

      {/* Publish feedback */}
      {publishMsg && (
        <div className={`flex items-center justify-between p-3 rounded-lg text-sm ${publishMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <span className="flex items-center gap-2">
            {publishMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {publishMsg.text}
          </span>
          <button onClick={() => setPublishMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search + tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por título, marca o categoría..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {SOURCE_TABS.map(t => (
              <button
                key={t.value}
                onClick={() => { setSource(t.value); setPage(1); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${source === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border transition-colors ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            <Filter className="w-4 h-4" />Filtros
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number" placeholder="Precio min USD"
              value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number" placeholder="Precio max USD"
              value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(category || minPrice || maxPrice) && (
              <button onClick={resetFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <X className="w-3.5 h-3.5" />Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        </div>
      ) : data?.products?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No hay productos en el catálogo</p>
          <p className="text-sm mt-1">Importa un CSV con ASINs o añade productos Dropi</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {data?.products?.map(p => (
            <ProductCard key={p.id} product={p} onPublish={handlePublish} publishing={publishing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">{data?.total} productos · Página {page} de {totalPages}</p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const n = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button key={n} onClick={() => setPage(n)} className={`w-9 h-9 rounded-lg border text-sm font-medium ${n === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>{n}</button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onDone={() => { queryClient.invalidateQueries(['catalog']); queryClient.invalidateQueries(['catalog-stats']); }}
        />
      )}
    </div>
  );
}
