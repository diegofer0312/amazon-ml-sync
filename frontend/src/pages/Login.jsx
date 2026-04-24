import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { Eye, EyeOff, Mail, Lock, Phone, ArrowRight, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, loginWithGoogle, sendOtp, verifyOtp, loginAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [mode, setMode] = useState('email'); // email | phone
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const [form, setForm] = useState({ email: '', password: '', phone: '', otp: '' });

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPhone, setAdminPhone] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ email: form.email, password: form.password });
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await sendOtp(form.phone);
      if (result.user?.is_admin) {
        navigate(from, { replace: true });
      } else {
        setOtpSent(true);
        toast.success('Código enviado por SMS');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar código');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(form.phone, form.otp);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminLoading(true);
    try {
      await loginAdmin(adminPhone);
      // Full reload so AuthContext re-reads the token from localStorage cleanly
      window.location.replace('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Acceso denegado');
      setAdminLoading(false);
    }
  };

  const handleGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return toast.error('Google OAuth no configurado');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin + '/auth/google-callback',
      response_type: 'token id_token',
      scope: 'openid email profile',
      nonce: Math.random().toString(36),
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 relative">
      {/* Admin access button — bottom right corner */}
      <button
        onClick={() => setShowAdminModal(true)}
        title="Acceso administrador"
        className="fixed bottom-5 right-5 w-9 h-9 bg-gray-800/70 hover:bg-gray-800 text-gray-400 hover:text-amber-400 rounded-full flex items-center justify-center transition-colors shadow-lg backdrop-blur-sm z-10"
      >
        <Lock size={14} />
      </button>

      {/* Admin modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-amber-500/30 rounded-2xl w-full max-w-sm p-8 shadow-2xl relative">
            <button
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
                <Lock size={16} className="text-gray-900" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">Acceso Administrador</h2>
                <p className="text-xs text-amber-400/80">Panel exclusivo</p>
              </div>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="tel"
                  placeholder="+57 300 000 0000"
                  value={adminPhone}
                  onChange={e => setAdminPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={adminLoading}
                className="w-full bg-amber-500 text-gray-900 py-3 rounded-xl font-semibold text-sm hover:bg-amber-400 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {adminLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                {adminLoading ? 'Verificando...' : 'Entrar como Admin'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="bg-gray-900 text-white text-sm font-bold px-2.5 py-1 rounded-lg">amazon</span>
          <span className="text-gray-400 text-xl font-light">→</span>
          <span className="bg-yellow-400 text-gray-900 text-sm font-bold px-2.5 py-1 rounded-lg">Mercado Libre</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">Iniciar sesión</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Bienvenido de vuelta</p>

        {/* Mode tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('email'); setOtpSent(false); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'email' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Email
          </button>
          <button
            onClick={() => { setMode('phone'); setOtpSent(false); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'phone' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Teléfono
          </button>
        </div>

        {/* Email form */}
        {mode === 'email' && (
          <form onSubmit={handleEmail} className="space-y-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email" placeholder="tu@email.com" value={form.email} onChange={set('email')}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPass ? 'text' : 'password'} placeholder="Contraseña" value={form.password} onChange={set('password')}
                className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        )}

        {/* Phone form */}
        {mode === 'phone' && !otpSent && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel" placeholder="+57 300 000 0000" value={form.phone} onChange={set('phone')}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              {loading ? 'Enviando...' : 'Enviar código SMS'}
            </button>
          </form>
        )}

        {mode === 'phone' && otpSent && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">Código enviado a {form.phone}</p>
            <input
              type="text" placeholder="123456" value={form.otp} onChange={set('otp')} maxLength={6}
              className="w-full text-center text-2xl font-mono py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest"
              required
            />
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button type="button" onClick={() => setOtpSent(false)} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Cambiar número
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-xs text-gray-400">o continúa con</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Social buttons */}
        <div className="space-y-3">
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <button
            onClick={() => toast('Facebook OAuth — configura VITE_FACEBOOK_APP_ID en .env', { icon: 'ℹ️' })}
            className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continuar con Facebook
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-blue-600 font-semibold hover:underline">Regístrate</Link>
        </p>
      </div>
    </div>
  );
}
