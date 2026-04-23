import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { competitionApi, productsApi, formatCOP } from '../services/api';
import { TrendingDown, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';

export default function Competition() {
  const [selectedProductId, setSelectedProductId] = useState('');
  const qc = useQueryClient();

  const { data: productsData } = useQuery({
    queryKey: ['products', { status: 'synced', page: 1, limit: 100 }],
    queryFn: () => productsApi.list({ status: 'synced', page: 1, limit: 100 }),
  });

  const { data: competitionData, isLoading, refetch } = useQuery({
    queryKey: ['competition', selectedProductId],
    queryFn: () => competitionApi.get(selectedProductId),
    enabled: !!selectedProductId,
  });

  const matchMutation = useMutation({
    mutationFn: () => competitionApi.matchPrice(selectedProductId),
    onSuccess: (data) => {
      toast.success(`Precio actualizado: ${formatCOP(data.old_price)} → ${formatCOP(data.new_price)}`);
      qc.invalidateQueries(['competition', selectedProductId]);
      qc.invalidateQueries(['products']);
    },
    onError: (e) => toast.error(e.message),
  });

  const products = productsData?.products || [];
  const comp = competitionData;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Monitor de Competencia</h1>
      <p className="text-sm text-gray-500 mb-6">Compara tus precios con otros vendedores del mismo producto en ML</p>

      <div className="flex gap-3 mb-6">
        <select
          className="flex-1 max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedProductId}
          onChange={e => setSelectedProductId(e.target.value)}
        >
          <option value="">Selecciona un producto publicado...</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {(p.ml_title || p.amazon_title || '').slice(0, 60)}
            </option>
          ))}
        </select>
        {selectedProductId && (
          <button onClick={() => refetch()} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400 text-sm">Buscando competidores...</div>}

      {comp && !isLoading && (
        <>
          <div className={`rounded-xl p-4 mb-5 ${comp.is_cheapest ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Tu precio actual</p>
                <p className="text-2xl font-bold text-gray-900">{formatCOP(comp.product.price)}</p>
              </div>
              <div className="text-center">
                <ArrowRight size={20} className="text-gray-400 mx-auto" />
                <p className="text-xs text-gray-400 mt-1">precio más bajo</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Más barato en ML</p>
                <p className={`text-2xl font-bold ${comp.is_cheapest ? 'text-green-600' : 'text-red-600'}`}>
                  {comp.lowest_price ? formatCOP(comp.lowest_price) : 'Eres el único'}
                </p>
              </div>
              <div className="text-right">
                {comp.is_cheapest ? (
                  <span className="text-green-600 text-sm font-medium">✅ Eres el más barato</span>
                ) : (
                  <div>
                    <p className="text-red-600 text-sm font-medium mb-2">
                      Estás {formatCOP(comp.price_diff)} por encima
                    </p>
                    <button
                      onClick={() => matchMutation.mutate()}
                      disabled={matchMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-60"
                    >
                      <TrendingDown size={14} />
                      {matchMutation.isPending ? 'Aplicando...' : 'Igualar precio más bajo'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
              {comp.competitors.length} competidores encontrados
            </div>
            {comp.competitors.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No se encontraron otros vendedores</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Producto</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vendedor</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Precio</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vendidos</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {comp.competitors.map((c, i) => {
                    const isCheaper = c.price < comp.product.price;
                    return (
                      <tr key={c.id} className={isCheaper ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {c.thumbnail && <img src={c.thumbnail} alt="" className="w-8 h-8 object-contain rounded" />}
                            <span className="text-xs text-gray-600 truncate max-w-[180px]">{c.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{c.seller_nickname || '—'}</td>
                        <td className={`px-4 py-3 font-semibold ${isCheaper ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCOP(c.price)}
                          {isCheaper && <span className="text-xs ml-1">↓</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{c.sold_quantity || 0}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{c.available_quantity || 0}</td>
                        <td className="px-4 py-3">
                          <a href={c.permalink} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700">
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!selectedProductId && (
        <div className="text-center py-16 text-gray-400 text-sm">
          <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
          <p>Selecciona un producto para ver los competidores</p>
        </div>
      )}
    </div>
  );
}
