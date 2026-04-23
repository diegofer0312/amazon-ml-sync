import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { syncApi, timeAgo } from '../services/api';

const STATUS_ICON = { ok: '✅', warn: '⚠️', error: '❌' };
const ACTION_LABELS = { import: 'Importación', publish: 'Publicación', sync: 'Sync precios', pause: 'Pausado' };

export default function SyncHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sync-logs', page],
    queryFn: () => syncApi.getLogs({ page, limit: 30 }),
    keepPreviousData: true,
  });

  const logs = Array.isArray(data) ? data : data?.logs || [];

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Historial de sincronización</h1>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-sm text-gray-400">Cargando...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Sin actividad registrada aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Acción</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Mensaje</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Precio anterior</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Precio nuevo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Hace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-base">{STATUS_ICON[log.status] || log.status}</td>
                  <td className="px-4 py-3 text-gray-700">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.message || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{log.old_price ? `$${log.old_price.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-gray-900">{log.new_price ? `$${log.new_price.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {logs.length === 30 && (
        <div className="flex justify-end mt-4 gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
