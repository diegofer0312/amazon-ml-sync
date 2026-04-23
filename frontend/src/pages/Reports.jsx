import { useQuery } from '@tanstack/react-query';
import { reportsApi, formatCOP } from '../services/api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, ShoppingBag, Package, DollarSign } from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

const CustomTooltipCOP = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.name === 'Ingresos' ? formatCOP(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Reports() {
  const { data: summary } = useQuery({ queryKey: ['reports-summary'], queryFn: reportsApi.getSummary });
  const { data: salesByDay = [] } = useQuery({ queryKey: ['reports-sales-by-day'], queryFn: reportsApi.getSalesByDay });
  const { data: topProducts = [] } = useQuery({ queryKey: ['reports-top'], queryFn: reportsApi.getTopProducts });
  const { data: priceComparison = [] } = useQuery({ queryKey: ['reports-prices'], queryFn: reportsApi.getPriceComparison });

  const chartData = salesByDay.map(d => ({
    day: d.day.slice(5),
    Órdenes: d.orders,
    Ingresos: d.revenue,
  }));

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Reportes y Estadísticas</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={ShoppingBag} label="Total órdenes" value={summary?.total_orders || 0}
          sub="Todas" color="bg-blue-500" />
        <StatCard icon={DollarSign} label="Ingresos totales" value={formatCOP(summary?.total_revenue || 0)}
          sub="Sin canceladas" color="bg-green-500" />
        <StatCard icon={Package} label="Productos activos" value={summary?.synced_products || 0}
          sub={`de ${summary?.total_products || 0} totales`} color="bg-purple-500" />
        <StatCard icon={TrendingUp} label="Órdenes (7 días)" value={summary?.orders_last_7_days || 0}
          sub="Últimos 7 días" color="bg-orange-500" />
      </div>

      {/* Sales by day */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas e Ingresos — Últimos 30 días</h2>
        {chartData.length === 0 || chartData.every(d => d.Órdenes === 0) ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            Sin datos de ventas aún. Sincroniza órdenes desde la sección "Ventas".
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis yAxisId="orders" orientation="left" tick={{ fontSize: 11 }} width={28} />
              <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11 }} width={60}
                tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
              <Tooltip content={<CustomTooltipCOP />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="orders" dataKey="Órdenes" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              <Area yAxisId="revenue" type="monotone" dataKey="Ingresos" stroke="#3b82f6"
                fill="url(#colorIngresos)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Top products */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Productos Más Vendidos</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos de ventas</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.ml_item_id || i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {p.ml_title || p.amazon_title || p.ml_item_id}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, (p.order_count / (topProducts[0]?.order_count || 1)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{p.order_count} ventas</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{formatCOP(p.total_revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price comparison */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Amazon vs ML — Margen por Producto</h2>
          {priceComparison.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin productos con precios</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={priceComparison.slice(0, 8).map(p => ({
                  name: (p.ml_title || p.amazon_title || '').slice(0, 12),
                  Amazon: p.amazon_price_cop,
                  ML: p.ml_price_cop,
                }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 10 }} width={60}
                  tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip formatter={(v) => formatCOP(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Amazon" fill="#f97316" radius={[2, 2, 0, 0]} />
                <Bar dataKey="ML" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Margin table */}
      {priceComparison.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mt-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
            Comparativa de Precios Amazon vs ML
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Producto</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Amazon (COP)</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Precio ML</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {priceComparison.slice(0, 15).map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-xs text-gray-700 truncate max-w-[200px]">
                    {p.ml_title || p.amazon_title}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 text-right">{formatCOP(p.amazon_price_cop)}</td>
                  <td className="px-4 py-2 text-xs font-medium text-gray-800 text-right">{formatCOP(p.ml_price_cop)}</td>
                  <td className={`px-4 py-2 text-xs font-semibold text-right ${p.margin_percent >= 20 ? 'text-green-600' : p.margin_percent >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {p.margin_percent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
