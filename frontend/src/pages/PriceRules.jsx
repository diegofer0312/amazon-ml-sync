import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { configApi, formatCOP } from '../services/api';
import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';

export default function PriceRules() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
  });

  const [form, setForm] = useState({
    trm: '4200',
    ml_commission: '11',
    default_margin: '20',
    min_price_cop: '50000',
  });

  useEffect(() => {
    if (config) {
      setForm({
        trm: config.trm || '4200',
        ml_commission: config.ml_commission ? String(parseFloat(config.ml_commission) * 100) : '11',
        default_margin: config.default_margin ? String(parseFloat(config.default_margin) * 100) : '20',
        min_price_cop: config.min_price_cop || '50000',
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => configApi.update({
      trm: form.trm,
      ml_commission: String(parseFloat(form.ml_commission) / 100),
      default_margin: String(parseFloat(form.default_margin) / 100),
      min_price_cop: form.min_price_cop,
    }),
    onSuccess: () => { toast.success('Configuración guardada'); qc.invalidateQueries(['config']); },
    onError: (e) => toast.error(e.message),
  });

  const trmMutation = useMutation({
    mutationFn: configApi.getTRM,
    onSuccess: (data) => {
      if (data?.trm) {
        setForm(f => ({ ...f, trm: String(Math.round(data.trm)) }));
        toast.success(`TRM actualizada: $${Math.round(data.trm).toLocaleString()}`);
      }
    },
    onError: () => toast.error('No se pudo obtener la TRM'),
  });

  const priceUsd = 100;
  const trm = parseFloat(form.trm) || 4200;
  const margin = parseFloat(form.default_margin) || 20;
  const commission = parseFloat(form.ml_commission) || 11;
  const base = priceUsd * trm;
  const withMargin = base * (1 + margin / 100);
  const final = Math.round(withMargin / (1 - commission / 100));

  if (isLoading) return <div className="text-sm text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Reglas de precios</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        {/* TRM */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">TRM (USD → COP)</label>
            <button
              onClick={() => trmMutation.mutate()}
              disabled={trmMutation.isPending}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-60"
            >
              <RefreshCw size={12} className={trmMutation.isPending ? 'animate-spin' : ''} />
              Actualizar TRM
            </button>
          </div>
          <input
            type="number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.trm}
            onChange={e => setForm(f => ({ ...f, trm: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">Tasa de cambio para convertir precios de Amazon a pesos colombianos.</p>
        </div>

        {/* Margen */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Margen de ganancia (%)</label>
          <input
            type="number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.default_margin}
            onChange={e => setForm(f => ({ ...f, default_margin: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">Porcentaje que se añade sobre el precio base para cubrir costos y obtener ganancia.</p>
        </div>

        {/* Comisión ML */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Comisión Mercado Libre (%)</label>
          <input
            type="number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.ml_commission}
            onChange={e => setForm(f => ({ ...f, ml_commission: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">Comisión que cobra ML sobre cada venta (típicamente 11%).</p>
        </div>

        {/* Precio mínimo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio mínimo en ML (COP)</label>
          <input
            type="number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.min_price_cop}
            onChange={e => setForm(f => ({ ...f, min_price_cop: e.target.value }))}
          />
        </div>

        {/* Simulación */}
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs font-medium text-blue-700 mb-3">Simulación — producto de $100 USD</p>
          <div className="space-y-1.5 text-sm text-gray-700">
            <div className="flex justify-between">
              <span>Precio Amazon</span><span>$100 USD</span>
            </div>
            <div className="flex justify-between">
              <span>× TRM</span><span>{formatCOP(base)}</span>
            </div>
            <div className="flex justify-between">
              <span>+ Margen {margin}%</span><span>+{formatCOP(withMargin - base)}</span>
            </div>
            <div className="flex justify-between">
              <span>+ Comisión ML {commission}%</span><span>+{formatCOP(final - withMargin)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-blue-200">
              <span>Precio final en ML</span>
              <span className="text-green-600">{formatCOP(final)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          <Save size={15} />
          {saveMutation.isPending ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  );
}
