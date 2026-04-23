import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ordersApi, formatCOP, ORDER_STATUS } from '../services/api';
import { RefreshCw, ShoppingBag, Package, Truck } from 'lucide-react';

const SHIPPING_LABELS = {
  ready_to_ship: { label: 'Listo para enviar', color: 'bg-blue-100 text-blue-700' },
  shipped: { label: 'Enviado', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-700' },
  not_delivered: { label: 'No entregado', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
};

export default function Orders() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const qc = useQueryClient();
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { page, statusFilter }],
    queryFn: () => ordersApi.list({ offset: (page - 1) * limit, limit, status: statusFilter || undefined }),
    keepPreviousData: true,
  });

  const refreshMutation = useMutation({
    mutationFn: ordersApi.refresh,
    onSuccess: (d) => {
      toast.success(`${d.saved} órdenes sincronizadas desde ML`);
      qc.invalidateQueries(['orders']);
    },
    onError: (e) => toast.error(e.message),
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Panel de Ventas y Órdenes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Órdenes sincronizadas desde Mercado Libre</p>
        </div>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} />
          {refreshMutation.isPending ? 'Sincronizando...' : 'Sincronizar ML'}
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <ShoppingBag size={17} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total órdenes</p>
              <p className="text-xl font-bold text-gray-900">{total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <Package size={17} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Pagadas</p>
              <p className="text-xl font-bold text-gray-900">{orders.filter(o => o.status === 'paid').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <Truck size={17} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">En tránsito</p>
              <p className="text-xl font-bold text-gray-900">{orders.filter(o => o.shipping_status === 'shipped').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4">
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando órdenes...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            <ShoppingBag size={36} className="mx-auto mb-2 opacity-30" />
            <p>Sin órdenes. Haz clic en "Sincronizar ML" para obtenerlas.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Orden</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Comprador</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Envío</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => {
                const statusBadge = ORDER_STATUS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' };
                const shippingBadge = SHIPPING_LABELS[order.shipping_status] || null;
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{order.ml_order_id?.slice(-8)}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-700 truncate max-w-[200px]">
                        {order.ml_title || order.amazon_title || order.ml_item_id || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{order.buyer_nickname || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCOP(order.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {shippingBadge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${shippingBadge.color}`}>
                          {shippingBadge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {order.order_date ? new Date(order.order_date).toLocaleDateString('es-CO') : '—'}
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
          <span>{total} órdenes en total</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
