import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { CheckCircle, Zap, BarChart2, RefreshCw, Shield, Headphones, Loader2, ArrowRight } from 'lucide-react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const features = [
  { icon: Zap, text: 'Importación automática desde Amazon (ASIN)' },
  { icon: BarChart2, text: 'Publicación masiva en Mercado Libre' },
  { icon: RefreshCw, text: 'Sincronización de precios en tiempo real' },
  { icon: BarChart2, text: 'Reportes de ventas y análisis de competencia' },
  { icon: Shield, text: 'Múltiples cuentas de Mercado Libre' },
  { icon: Headphones, text: 'Soporte prioritario y actualizaciones incluidas' },
  { icon: CheckCircle, text: 'Auto-respuestas a preguntas de compradores' },
  { icon: CheckCircle, text: 'Alertas de stock y gestión de inventario' },
];

export default function Pricing() {
  const { user, isAuthenticated, getToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      navigate('/register', { state: { from: { pathname: '/pricing' } } });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${BASE_URL}/payments/create-checkout`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al iniciar el pago';
      if (msg.includes('no configurado')) {
        toast('Stripe no configurado. En producción conecta tu cuenta de Stripe.', { icon: 'ℹ️', duration: 5000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="bg-white/20 text-white text-sm font-bold px-3 py-1.5 rounded-lg backdrop-blur">amazon</span>
            <span className="text-white/60 text-xl font-light">→</span>
            <span className="bg-yellow-400 text-gray-900 text-sm font-bold px-3 py-1.5 rounded-lg">Mercado Libre</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Sync Manager Pro</h1>
          <p className="text-white/70 text-lg">Automatiza tu negocio entre Amazon y Mercado Libre</p>
        </div>

        {/* Pricing card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center text-white">
            <div className="text-sm font-medium opacity-80 mb-1">Plan mensual</div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-2xl font-bold">USD</span>
              <span className="text-6xl font-extrabold">100</span>
              <span className="text-xl opacity-80">/mes</span>
            </div>
            <div className="mt-2 text-sm opacity-80">~COP 420.000 • Cancela cuando quieras</div>
          </div>

          <div className="p-6">
            <div className="space-y-3 mb-6">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-gray-700">
                  <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={12} className="text-blue-600" />
                  </div>
                  {text}
                </div>
              ))}
            </div>

            <button onClick={handleSubscribe} disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-2xl font-bold text-base hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {loading ? 'Redirigiendo...' : 'Suscribirse ahora'}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">
              Pago seguro con Stripe • Sin permanencia mínima
            </p>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="flex justify-center gap-6 mt-6 text-white/60 text-xs">
          <span>🔒 SSL Seguro</span>
          <span>💳 Stripe Certified</span>
          <span>🔄 Cancela cuando quieras</span>
        </div>

        {user && (
          <div className="text-center mt-4">
            <button onClick={() => navigate('/')} className="text-white/60 text-sm hover:text-white underline">
              Volver al panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
