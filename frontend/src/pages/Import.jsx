import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { productsApi, configApi, formatCOP, formatUSD } from '../services/api';
import { Search, Upload, CheckCircle2, Languages, Sliders, TrendingUp } from 'lucide-react';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

async function translateWithClaude(title, description) {
  if (!ANTHROPIC_API_KEY) throw new Error('Agrega VITE_ANTHROPIC_API_KEY en el archivo .env del frontend');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Traduce al español colombiano este producto de Amazon. Devuelve SOLO un JSON con esta estructura exacta: {"title": "...", "description": "..."}

Título original: ${title}

Descripción original: ${description || 'Sin descripción'}

Reglas:
- Traduce el título para que sea atractivo para compradores colombianos
- Máximo 60 caracteres en el título
- La descripción debe ser clara y enfocada en beneficios
- No añadas precios ni garantías específicas
- Responde SOLO el JSON, sin texto adicional`
      }]
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Error al traducir');
  }
  const data = await response.json();
  const text = data.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Respuesta inválida de la IA');
  return JSON.parse(jsonMatch[0]);
}

function PriceBreakdown({ priceUsd, priceCop, trm, commission, margin }) {
  const base = priceUsd * trm;
  const withMargin = base * (1 + margin / 100);
  const withComm = withMargin / (1 - commission / 100);
  return (
    <div className="bg-gray-50 rounded-lg p-4 text-sm">
      <p className="font-medium text-gray-700 mb-3">Desglose de precio</p>
      <div className="space-y-1.5 text-gray-600">
        <div className="flex justify-between"><span>Precio Amazon</span><span>{formatUSD(priceUsd)}</span></div>
        <div className="flex justify-between"><span>× TRM (${trm?.toLocaleString()})</span><span>{formatCOP(base)}</span></div>
        <div className="flex justify-between"><span>+ Margen ({margin}%)</span><span>+{formatCOP(withMargin - base)}</span></div>
        <div className="flex justify-between"><span>+ Comisión ML ({commission}%)</span><span>+{formatCOP(withComm - withMargin)}</span></div>
        <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-200">
          <span>Precio final en ML</span>
          <span className="text-green-600">{formatCOP(priceCop)}</span>
        </div>
      </div>
    </div>
  );
}

function ProfitabilityPanel({ priceUsd, priceCop, trm }) {
  const [shippingCost, setShippingCost] = useState(15000);
  const [commissionPct, setCommissionPct] = useState(11);
  const [extraCosts, setExtraCosts] = useState(0);

  const amazonCOP = Math.round(priceUsd * trm);
  const mlCommission = Math.round(priceCop * commissionPct / 100);
  const totalCosts = amazonCOP + shippingCost + mlCommission + extraCosts;
  const netProfit = priceCop - totalCosts;
  const profitPct = priceCop > 0 ? Math.round((netProfit / priceCop) * 100) : 0;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} className="text-blue-600" />
        <p className="font-medium text-sm text-blue-900">Calculadora de Rentabilidad</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Costo envío est. (COP)</label>
          <input type="range" min="0" max="50000" step="1000" value={shippingCost}
            onChange={e => setShippingCost(+e.target.value)}
            className="w-full accent-blue-500" />
          <span className="text-xs font-medium text-gray-700">{formatCOP(shippingCost)}</span>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Comisión ML (%)</label>
          <input type="range" min="1" max="25" step="0.5" value={commissionPct}
            onChange={e => setCommissionPct(+e.target.value)}
            className="w-full accent-blue-500" />
          <span className="text-xs font-medium text-gray-700">{commissionPct}%</span>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Otros costos (COP)</label>
          <input type="range" min="0" max="50000" step="1000" value={extraCosts}
            onChange={e => setExtraCosts(+e.target.value)}
            className="w-full accent-blue-500" />
          <span className="text-xs font-medium text-gray-700">{formatCOP(extraCosts)}</span>
        </div>
        <div className="flex items-end">
          <div className={`w-full rounded-lg px-3 py-2 text-center ${netProfit >= 0 ? 'bg-green-100 border border-green-200' : 'bg-red-100 border border-red-200'}`}>
            <p className="text-xs text-gray-500">Rentabilidad</p>
            <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitPct}%</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <div className="flex justify-between text-gray-500"><span>Costo Amazon:</span><span className="font-medium text-gray-700">{formatCOP(amazonCOP)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Comisión ML:</span><span className="font-medium text-gray-700">{formatCOP(mlCommission)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Envío:</span><span className="font-medium text-gray-700">{formatCOP(shippingCost)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Total costos:</span><span className="font-medium text-gray-700">{formatCOP(totalCosts)}</span></div>
        <div className="col-span-2 flex justify-between font-semibold pt-1 border-t border-blue-100">
          <span className="text-gray-700">Ganancia neta:</span>
          <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCOP(netProfit)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Import() {
  const [input, setInput] = useState('');
  const [product, setProduct] = useState(null);
  const [editData, setEditData] = useState({});
  const [trm, setTrm] = useState(4200);
  const [margin, setMargin] = useState(20);
  const [commission, setCommission] = useState(11);
  const [translating, setTranslating] = useState(false);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: () => productsApi.import(input),
    onSuccess: (data) => {
      setProduct(data);
      setTrm(4200);
      setEditData({
        ml_title: data.title,
        ml_description: data.description || '',
        ml_price_cop: data.price_cop,
        ml_stock: 10,
        ml_condition: 'new',
      });
      toast.success('Producto importado correctamente');
    },
    onError: (err) => toast.error(err.message),
  });

  const publishMutation = useMutation({
    mutationFn: () => productsApi.publish(product.product_id),
    onSuccess: () => {
      toast.success('¡Publicado en Mercado Libre! 🎉');
      queryClient.invalidateQueries(['products']);
      queryClient.invalidateQueries(['stats']);
      setProduct(null);
      setInput('');
    },
    onError: (err) => toast.error(`Error al publicar: ${err.message}`),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () => productsApi.update(product.product_id, { ...editData, sync_status: 'pending' }),
    onSuccess: () => {
      toast.success('Guardado como pendiente');
      queryClient.invalidateQueries(['products']);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTranslate = async () => {
    if (!product) return;
    setTranslating(true);
    try {
      const result = await translateWithClaude(editData.ml_title || product.title, editData.ml_description || product.description);
      setEditData(prev => ({ ...prev, ml_title: result.title, ml_description: result.description }));
      toast.success('¡Traducción completada con IA!');
    } catch (err) {
      toast.error(`Error al traducir: ${err.message}`);
    } finally {
      setTranslating(false);
    }
  };

  const calcPrice = () => {
    if (!product?.price_usd) return 0;
    const base = product.price_usd * trm;
    const withMargin = base * (1 + margin / 100);
    return Math.round(withMargin / (1 - commission / 100));
  };

  const handleField = (k, v) => setEditData(p => ({ ...p, [k]: v }));

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Importar desde Amazon</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">URL de Amazon o ASIN</label>
        <div className="flex gap-3">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://www.amazon.com/dp/B09JQMJHXY   o   B09JQMJHXY"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && importMutation.mutate()}
          />
          <button
            onClick={() => importMutation.mutate()}
            disabled={!input.trim() || importMutation.isPending}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            <Search size={15} />
            {importMutation.isPending ? 'Buscando...' : 'Obtener producto'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Pega el link de cualquier producto de Amazon.com, Amazon.es, etc.</p>
      </div>

      {product && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="grid grid-cols-[220px_1fr] gap-6">
            {/* Imágenes */}
            <div>
              <div className="w-full aspect-square bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center mb-2 overflow-hidden">
                {product.images?.[0]
                  ? <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                  : <span className="text-5xl">📦</span>
                }
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(product.images || []).slice(1, 5).map((img, i) => (
                  <div key={i} className="aspect-square bg-gray-50 rounded border border-gray-100 overflow-hidden">
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">{product.images?.length || 0} imágenes</p>
            </div>

            {/* Formulario */}
            <div className="space-y-4">
              {/* Traducción */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500">Título en Mercado Libre</label>
                  <button
                    onClick={handleTranslate}
                    disabled={translating}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                  >
                    <Languages size={12} />
                    {translating ? 'Traduciendo...' : 'Traducir con IA'}
                  </button>
                </div>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editData.ml_title || ''}
                  onChange={e => handleField('ml_title', e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-0.5">{(editData.ml_title || '').length}/60 caracteres</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={4}
                  value={editData.ml_description || ''}
                  onChange={e => handleField('ml_description', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">TRM (USD→COP)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={trm} onChange={e => setTrm(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Margen (%)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={margin} onChange={e => setMargin(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Comisión ML (%)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={commission} onChange={e => setCommission(+e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stock</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editData.ml_stock || 10} onChange={e => handleField('ml_stock', +e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Condición</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editData.ml_condition || 'new'} onChange={e => handleField('ml_condition', e.target.value)}>
                    <option value="new">Nuevo</option>
                    <option value="used">Usado</option>
                  </select>
                </div>
              </div>

              <PriceBreakdown
                priceUsd={product.price_usd}
                priceCop={calcPrice()}
                trm={trm} margin={margin} commission={commission}
              />

              <ProfitabilityPanel
                priceUsd={product.price_usd}
                priceCop={calcPrice()}
                trm={trm}
              />

              {product.category && (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
                  <CheckCircle2 size={13} className="text-blue-500" />
                  Categoría ML detectada: <strong>{product.category.name || product.category.id}</strong>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Guardar borrador
                </button>
                <button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                  className="flex-1 py-2.5 bg-yellow-400 text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-500 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Upload size={15} />
                  {publishMutation.isPending ? 'Publicando...' : 'Publicar en Mercado Libre'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!product && !importMutation.isPending && (
        <div className="text-center py-16 text-gray-400">
          <Search size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Ingresa una URL de Amazon para empezar</p>
        </div>
      )}
    </div>
  );
}
