import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { BASE_URL } from '../services/api';

export default function MlCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setMessage('Autorización cancelada por el usuario.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No se recibió el código de autorización.');
      return;
    }

    fetch(`${BASE_URL}/auth/callback?code=${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setMessage('¡Cuenta de Mercado Libre conectada exitosamente!');
          window.opener?.postMessage('ml_auth_done', '*');
          setTimeout(() => {
            if (window.opener) window.close();
            else navigate('/config');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Error al conectar la cuenta.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Error de conexión con el servidor.');
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={40} className="animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Conectando con Mercado Libre...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
            <p className="text-gray-800 font-semibold mb-2">¡Conectado!</p>
            <p className="text-gray-500 text-sm">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={40} className="text-red-500 mx-auto mb-4" />
            <p className="text-gray-800 font-semibold mb-2">Error</p>
            <p className="text-gray-500 text-sm mb-5">{message}</p>
            <button
              onClick={() => navigate('/config')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Volver a Configuración
            </button>
          </>
        )}
      </div>
    </div>
  );
}
