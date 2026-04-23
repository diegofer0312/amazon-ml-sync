import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { CheckCircle, XCircle, CreditCard, Calendar, Loader2, ExternalLink, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Subscription() {
  const { user, isPro, getToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (params.get('success') === 'true') {
      toast.success('¡Suscripción activada! Bienvenido a Pro.');
    }
    if (params.get('cancelled') === 'true') {
      toast('Pago cancelado', { icon: '↩️' });
    }
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const { data } = await axios.get(`${BASE_URL}/payments/status`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setStatus(data);
    } catch (err) {
      toast.error('Error al cargar suscripción');
    } finally {
      setLoading(false);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await axios.post(`${BASE_URL}/payments/portal`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al abrir portal de facturación');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  const isActive = status?.is_active;
  const expiresAt = status?.expires_at ? new Date(status.expires_at).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : null;

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} /> Volver al panel
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mi suscripción</h1>

      {/* Status card */}
      <div className={`rounded-2xl p-6 mb-4 ${isActive ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          {isActive
            ? <CheckCircle size={24} className="text-green-500" />
            : <XCircle size={24} className="text-gray-400" />
          }
          <div>
            <div className="font-semibold text-gray-900">
              {isActive ? 'Plan Pro — Activo' : 'Plan Trial'}
            </div>
            {expiresAt && (
              <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <Calendar size={12} />
                {isActive ? `Renueva el ${expiresAt}` : `Expiró el ${expiresAt}`}
              </div>
            )}
          </div>
          {isActive && (
            <span className="ml-auto bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">ACTIVO</span>
          )}
        </div>

        {isActive && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {['Amazon sync', 'ML publicación', 'Multi-cuenta', 'Reportes'].map(f => (
              <div key={f} className="flex items-center gap-2 text-gray-700">
                <CheckCircle size={14} className="text-green-500" />
                {f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Cuenta</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Email</span>
            <span className="font-medium text-gray-900">{user?.email || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Plan</span>
            <span className={`font-medium ${isActive ? 'text-green-600' : 'text-gray-500'}`}>
              {isActive ? 'Pro ($100 USD/mes)' : 'Trial'}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {isActive ? (
          <button onClick={openPortal} disabled={portalLoading}
            className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors">
            {portalLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {portalLoading ? 'Cargando...' : 'Gestionar facturación'}
            <ExternalLink size={14} className="text-gray-400 ml-1" />
          </button>
        ) : (
          <button onClick={() => navigate('/pricing')}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            Activar suscripción — $100/mes
          </button>
        )}
      </div>
    </div>
  );
}
