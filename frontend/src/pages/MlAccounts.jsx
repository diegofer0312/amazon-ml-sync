import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { mlAccountsApi } from '../services/api';
import { UserCircle, CheckCircle2, Plus, Trash2, Star } from 'lucide-react';

export default function MlAccounts() {
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['ml-accounts'],
    queryFn: mlAccountsApi.list,
  });

  const addAccountMutation = useMutation({
    mutationFn: async () => {
      const data = await mlAccountsApi.getAuthUrl();
      const popup = window.open(data.url, 'ml_auth', 'width=600,height=700,left=200,top=100');
      return new Promise((resolve, reject) => {
        const handler = (e) => {
          if (e.data === 'ml_auth_done') {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
        // Fallback: check if popup closed
        const timer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(timer);
            window.removeEventListener('message', handler);
            resolve();
          }
        }, 1000);
      });
    },
    onSuccess: () => {
      toast.success('Cuenta conectada exitosamente');
      qc.invalidateQueries(['ml-accounts']);
    },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = useMutation({
    mutationFn: mlAccountsApi.activate,
    onSuccess: (data) => {
      toast.success(`Cuenta activa: ${data.nickname}`);
      qc.invalidateQueries(['ml-accounts']);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: mlAccountsApi.delete,
    onSuccess: () => { toast.success('Cuenta eliminada'); qc.invalidateQueries(['ml-accounts']); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Múltiples Cuentas de Mercado Libre</h1>
          <p className="text-sm text-gray-500 mt-0.5">Conecta y gestiona varias cuentas de ML</p>
        </div>
        <button
          onClick={() => addAccountMutation.mutate()}
          disabled={addAccountMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 text-gray-900 text-sm font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-60"
        >
          <Plus size={15} />
          {addAccountMutation.isPending ? 'Abriendo...' : 'Agregar cuenta'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Cargando cuentas...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserCircle size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay cuentas conectadas.</p>
          <p className="text-xs mt-1">Haz clic en "Agregar cuenta" para conectar tu primera cuenta de ML.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => (
            <div key={account.id}
              className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${account.is_active ? 'border-yellow-300 bg-yellow-50' : 'border-gray-100'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${account.is_active ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-500'}`}>
                {(account.nickname || 'ML')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{account.nickname || `Cuenta ${account.id}`}</p>
                  {account.is_active && (
                    <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                      <Star size={10} fill="currentColor" /> Activa
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  ID: {account.user_id} · {account.site_id} · Conectada {new Date(account.created_at).toLocaleDateString('es-CO')}
                </p>
              </div>
              <div className="flex gap-2">
                {!account.is_active && (
                  <button
                    onClick={() => activateMutation.mutate(account.id)}
                    disabled={activateMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                  >
                    <CheckCircle2 size={12} /> Activar
                  </button>
                )}
                <button
                  onClick={() => { if (confirm(`¿Eliminar cuenta ${account.nickname}?`)) deleteMutation.mutate(account.id); }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-blue-50 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-medium mb-1">ℹ️ Cómo funciona</p>
        <ul className="space-y-0.5 list-disc list-inside text-blue-600">
          <li>Solo una cuenta puede estar activa a la vez</li>
          <li>La cuenta activa se usa para todas las operaciones con ML</li>
          <li>Al activar una cuenta diferente, los tokens se actualizan automáticamente</li>
          <li>Los productos se pueden asociar a una cuenta en su configuración</li>
        </ul>
      </div>
    </div>
  );
}
