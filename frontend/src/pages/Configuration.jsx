import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { authApi } from '../services/api';
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-react';

function StatusDot({ ok }) {
  return ok
    ? <span className="flex items-center gap-1.5 text-green-600 text-sm"><CheckCircle2 size={15} /> Conectado</span>
    : <span className="flex items-center gap-1.5 text-red-500 text-sm"><XCircle size={15} /> No conectado</span>;
}

export default function Configuration() {
  const [mlConnected, setMlConnected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setMlConnected(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const { data: authStatus, isLoading, refetch } = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.getStatus,
    refetchInterval: 15000,
  });

  const mlAuthMutation = useMutation({
    mutationFn: authApi.getMlAuthUrl,
    onSuccess: (data) => {
      if (data?.auth_url) window.open(data.auth_url, '_blank');
      else toast.error('No se pudo obtener el link de autorización');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Configuración de APIs</h1>

      {mlConnected && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm font-medium">
          <CheckCircle2 size={16} />
          Mercado Libre conectado correctamente
        </div>
      )}

      {/* Amazon */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="bg-amazon text-white text-xs font-bold px-2 py-0.5 rounded">amazon</span>
            <span className="font-medium text-gray-800">Amazon Product API</span>
          </div>
          {isLoading ? <span className="text-sm text-gray-400">...</span> : <StatusDot ok={authStatus?.amazon?.connected} />}
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Las credenciales de Amazon se configuran como variables de entorno en el servidor backend.
        </p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>AMAZON_CLIENT_ID=amzn1.application-oa2-client...</p>
          <p>AMAZON_CLIENT_SECRET=tu_client_secret</p>
          <p>AMAZON_REFRESH_TOKEN=Atzr|...</p>
          <p>AMAZON_MARKETPLACE_ID=A2Q3Y263D00KWC</p>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Edita el archivo <code className="bg-gray-100 px-1 rounded">.env</code> en la carpeta <code className="bg-gray-100 px-1 rounded">backend/</code> y reinicia el servidor.
        </p>
      </div>

      {/* Mercado Libre */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="bg-yellow-400 text-gray-800 text-xs font-bold px-2 py-0.5 rounded">Mercado Libre</span>
            <span className="font-medium text-gray-800">OAuth 2.0</span>
          </div>
          {isLoading ? <span className="text-sm text-gray-400">...</span> : <StatusDot ok={authStatus?.mercadolibre?.connected} />}
        </div>

        {authStatus?.mercadolibre?.connected ? (
          <div className="bg-green-50 rounded-lg p-4 text-sm">
            <p className="text-green-700 font-medium mb-1">Sesión activa</p>
            {authStatus.mercadolibre.user && (
              <p className="text-green-600">
                Usuario: <strong>{authStatus.mercadolibre.user.nickname}</strong>
                {authStatus.mercadolibre.user.email && ` (${authStatus.mercadolibre.user.email})`}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Para publicar en Mercado Libre necesitas autorizar la app con tu cuenta de vendedor.
            </p>
            <button
              onClick={() => mlAuthMutation.mutate()}
              disabled={mlAuthMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-yellow-400 text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-500 disabled:opacity-60"
            >
              <ExternalLink size={15} />
              {mlAuthMutation.isPending ? 'Obteniendo link...' : 'Conectar con Mercado Libre'}
            </button>
          </div>
        )}

        <div className="mt-4 bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>ML_APP_ID=tu_app_id</p>
          <p>ML_SECRET_KEY=tu_secret_key</p>
          <p>ML_REDIRECT_URI=http://localhost:5173/auth/callback</p>
          <p>ML_SITE_ID=MCO</p>
        </div>

        <button
          onClick={() => refetch()}
          className="mt-3 text-xs text-gray-400 hover:text-gray-600"
        >
          Actualizar estado de conexión
        </button>
      </div>
    </div>
  );
}
