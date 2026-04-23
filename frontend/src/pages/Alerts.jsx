import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { alertsApi, productsApi } from '../services/api';
import { Bell, BellOff, Trash2, CheckCheck, RefreshCw, Settings } from 'lucide-react';

const ALERT_ICONS = {
  low_stock: { icon: '⚠️', color: 'bg-yellow-50 border-yellow-200' },
  out_of_stock: { icon: '🔴', color: 'bg-red-50 border-red-200' },
  amazon_no_stock: { icon: '📦', color: 'bg-orange-50 border-orange-200' },
};

export default function Alerts() {
  const [tab, setTab] = useState('alerts');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', unreadOnly],
    queryFn: () => alertsApi.list({ unread_only: unreadOnly }),
    refetchInterval: 30000,
  });

  const { data: configList = [] } = useQuery({
    queryKey: ['alert-configs'],
    queryFn: alertsApi.getConfig,
    enabled: tab === 'config',
  });

  const { data: allProductsData } = useQuery({
    queryKey: ['products', { page: 1, limit: 100 }],
    queryFn: () => productsApi.list({ page: 1, limit: 100 }),
    enabled: tab === 'config',
  });

  const markReadMutation = useMutation({
    mutationFn: alertsApi.markRead,
    onSuccess: () => qc.invalidateQueries(['alerts']),
  });

  const markAllMutation = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => { toast.success('Todas marcadas como leídas'); qc.invalidateQueries(['alerts']); },
  });

  const deleteMutation = useMutation({
    mutationFn: alertsApi.delete,
    onSuccess: () => qc.invalidateQueries(['alerts']),
  });

  const checkStockMutation = useMutation({
    mutationFn: alertsApi.checkStock,
    onSuccess: (d) => {
      toast.success(`Verificación completa: ${d.alerts_created} alertas nuevas`);
      qc.invalidateQueries(['alerts']);
    },
    onError: (e) => toast.error(e.message),
  });

  const saveConfigMutation = useMutation({
    mutationFn: ({ productId, data }) => alertsApi.setConfig(productId, data),
    onSuccess: () => { toast.success('Configuración guardada'); qc.invalidateQueries(['alert-configs']); },
  });

  const alerts = data?.alerts || [];
  const unreadCount = data?.unread_count || 0;
  const allProducts = allProductsData?.products || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Alertas de Stock</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => checkStockMutation.mutate()}
            disabled={checkStockMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-60"
          >
            <RefreshCw size={14} className={checkStockMutation.isPending ? 'animate-spin' : ''} />
            Verificar stock
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <CheckCheck size={14} /> Marcar todo leído
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {[['alerts', `Alertas${unreadCount > 0 ? ` (${unreadCount})` : ''}`], ['config', 'Configurar']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === k ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}
              className="rounded" />
            Solo no leídas
          </label>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Cargando alertas...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              <Bell size={36} className="mx-auto mb-2 opacity-30" />
              <p>{unreadOnly ? 'No hay alertas no leídas' : 'No hay alertas'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => {
                const style = ALERT_ICONS[alert.alert_type] || { icon: '🔔', color: 'bg-gray-50 border-gray-200' };
                return (
                  <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-xl border ${style.color} ${alert.is_read ? 'opacity-60' : ''}`}>
                    <span className="text-lg flex-shrink-0">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {alert.ml_title || alert.amazon_title || `Producto #${alert.product_id}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!alert.is_read && (
                        <button onClick={() => markReadMutation.mutate(alert.id)}
                          className="p-1.5 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600" title="Marcar leída">
                          <BellOff size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteMutation.mutate(alert.id)}
                        className="p-1.5 rounded hover:bg-white/60 text-red-400" title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'config' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            Configura el umbral de stock bajo para cada producto activo en ML.
          </p>
          {allProducts.filter(p => p.ml_status === 'active').length === 0 ? (
            <p className="text-sm text-gray-400">No hay productos activos en ML.</p>
          ) : allProducts.filter(p => p.ml_status === 'active').map(product => {
            const cfg = configList.find(c => c.product_id === product.id);
            return (
              <div key={product.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {product.ml_title || product.amazon_title}
                  </p>
                  <p className="text-xs text-gray-400">Stock actual: {product.ml_stock || 0}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-500">Umbral de alerta:</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={cfg?.low_stock_threshold ?? 5}
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    id={`threshold-${product.id}`}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={cfg?.enabled !== 0}
                      id={`enabled-${product.id}`}
                    />
                    Activo
                  </label>
                  <button
                    onClick={() => {
                      const threshold = parseInt(document.getElementById(`threshold-${product.id}`).value) || 5;
                      const enabled = document.getElementById(`enabled-${product.id}`).checked;
                      saveConfigMutation.mutate({ productId: product.id, data: { low_stock_threshold: threshold, enabled } });
                    }}
                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  >
                    <Settings size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
