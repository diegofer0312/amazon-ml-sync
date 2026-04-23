import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { productsApi, formatCOP, formatUSD, timeAgo, STATUS_LABELS } from '../services/api';
import { Search, Upload, Pause, Trash2, CheckSquare, Square, DollarSign, X } from 'lucide-react';

function BulkPriceModal({ selectedIds, onClose, onDone }) {
  const [mode, setMode] = useState('markup');
  const [markup, setMarkup] = useState(20);
  const [fixedPrice, setFixedPrice] = useState('');
  const qc = useQueryClient();

  const bulkMutation = useMutation({
    mutationFn: (data) => productsApi.bulkPrice(data),
    onSuccess: (data) => {
      toast.success(`${data.updated} productos actualizados`);
      qc.invalidateQueries(['products']);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApply = () => {
    if (mode === 'markup') {
      bulkMutation.mutate({ product_ids: selectedIds, markup_percent: markup });
    } else {
      if (!fixedPrice) return toast.error('Ingresa un precio fijo');
      bulkMutation.mutate({ product_ids: selectedIds, price_cop: parseInt(fixedPrice) });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Edición Masiva de Precios</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{selectedIds.length} productos seleccionados</p>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          {[['markup', 'Por margen'], ['fixed', 'Precio fijo']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === k ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
              {l}
            </button>
          ))}
        </div>

        {mode === 'markup' ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Nuevo margen (%)</label>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={markup}
              onChange={e => setMarkup(+e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Recalcula el precio usando el precio de Amazon × TRM × (1 + margen%)
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Precio fijo en COP</label>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 150000"
              value={fixedPrice}
              onChange={e => setFixedPrice(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Aplica el mismo precio a todos los seleccionados</p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleApply}
            disabled={bulkMutation.isPending}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            <DollarSign size={14} />
            {bulkMutation.isPending ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', { search, status, page }],
    queryFn: () => productsApi.list({ search, status, page, limit: 20 }),
    keepPreviousData: true,
  });

  const publishMutation = useMutation({
    mutationFn: productsApi.publish,
    onSuccess: () => { toast.success('Publicado en ML'); qc.invalidateQueries(['products']); },
    onError: (e) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: productsApi.pause,
    onSuccess: () => { toast.success('Pausado'); qc.invalidateQueries(['products']); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => { toast.success('Eliminado'); qc.invalidateQueries(['products']); },
    onError: (e) => toast.error(e.message),
  });

  const products = data?.products || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  };

  const exitBulk = () => { setBulkMode(false); setSelected(new Set()); };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Productos</h1>
        <button
          onClick={() => { setBulkMode(b => !b); setSelected(new Set()); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${bulkMode ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <CheckSquare size={14} />
          {bulkMode ? 'Salir de edición masiva' : 'Edición masiva'}
        </button>
      </div>

      {/* Bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-blue-800 font-medium">{selected.size} productos seleccionados</span>
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <DollarSign size={13} /> Cambiar precio
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-500 hover:text-blue-700 ml-auto">
            Deseleccionar todo
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Buscar por título o ASIN..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No hay productos aún. Importa desde la sección <strong>Importar</strong>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {bulkMode && (
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAll} className="text-gray-400 hover:text-blue-500">
                      {selected.size === products.length ? <CheckSquare size={15} className="text-blue-500" /> : <Square size={15} />}
                    </button>
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Amazon</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Precio ML</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Margen</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Actualizado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map(p => {
                const badge = STATUS_LABELS[p.sync_status] || { label: p.sync_status, color: 'bg-gray-100 text-gray-600' };
                const isSelected = selected.has(p.id);
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                    {bulkMode && (
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(p.id)} className="text-gray-400 hover:text-blue-500">
                          {isSelected ? <CheckSquare size={15} className="text-blue-500" /> : <Square size={15} />}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.amazon_images?.[0]
                          ? <img src={p.amazon_images[0]} alt="" className="w-10 h-10 object-contain rounded border border-gray-100 flex-shrink-0" />
                          : <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-lg flex-shrink-0">📦</div>
                        }
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate max-w-[200px]">{p.ml_title || p.amazon_title}</p>
                          <p className="text-xs text-gray-400">{p.asin}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatUSD(p.amazon_price_usd)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatCOP(p.ml_price_cop)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.markup_percent ? `${p.markup_percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(p.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {p.sync_status !== 'synced' && (
                          <button onClick={() => publishMutation.mutate(p.id)} disabled={publishMutation.isPending}
                            className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600" title="Publicar en ML">
                            <Upload size={14} />
                          </button>
                        )}
                        {p.sync_status === 'synced' && (
                          <button onClick={() => pauseMutation.mutate(p.id)} disabled={pauseMutation.isPending}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="Pausar">
                            <Pause size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm('¿Eliminar este producto?')) deleteMutation.mutate(p.id); }}
                          className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{total} productos en total</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}

      {showBulkModal && (
        <BulkPriceModal
          selectedIds={Array.from(selected)}
          onClose={() => setShowBulkModal(false)}
          onDone={() => { setShowBulkModal(false); exitBulk(); }}
        />
      )}
    </div>
  );
}
