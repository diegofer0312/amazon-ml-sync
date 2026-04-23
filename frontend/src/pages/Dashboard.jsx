import { useQuery } from '@tanstack/react-query';
import { syncApi, productsApi, formatCOP, timeAgo } from '../services/api';
import { CheckCircle2, AlertTriangle, XCircle, Clock, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function StatCard({ label, value, icon: Icon, color, sub }) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: syncApi.getStats,
    refetchInterval: 30000,
  });

  const { data: logsData } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: () => syncApi.getLogs({ limit: 10 }),
    refetchInterval: 30000,
  });

  const chartData = [
    { name: 'Activos', value: stats?.synced || 0, color: '#16a34a' },
    { name: 'Pendientes', value: stats?.pending || 0, color: '#ca8a04' },
    { name: 'Errores', value: stats?.errors || 0, color: '#dc2626' },
  ];

  const logIcon = { ok: '✅', warn: '⚠️', error: '❌' };

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Sincronizados en ML" value={isLoading ? '...' : stats?.synced || 0}
          icon={CheckCircle2} color="green" sub="Publicaciones activas" />
        <StatCard label="Pendientes de publicar" value={isLoading ? '...' : stats?.pending || 0}
          icon={Clock} color="yellow" sub="Requieren revisión" />
        <StatCard label="Actualizados hoy" value={isLoading ? '...' : stats?.updatedToday || 0}
          icon={TrendingUp} color="blue" sub={`Última: ${timeAgo(stats?.lastSync)}`} />
        <StatCard label="Con errores" value={isLoading ? '...' : stats?.errors || 0}
          icon={XCircle} color="red" sub="Requieren atención" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Estado del catálogo</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Logs recientes */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Actividad reciente</h2>
          <div className="space-y-2.5">
            {logsData?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Sin actividad aún</p>
            )}
            {(logsData || []).map(log => (
              <div key={log.id} className="flex items-start gap-2.5 text-sm">
                <span className="text-base leading-none mt-0.5">{logIcon[log.status]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate">{log.message}</p>
                  <p className="text-xs text-gray-400">{log.product_name && `${log.product_name} · `}{timeAgo(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
