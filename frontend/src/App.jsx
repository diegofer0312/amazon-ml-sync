import { BrowserRouter, Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import {
  LayoutDashboard, Package, Download, DollarSign, History, Settings,
  RefreshCw, Link2, FileUp, MessageSquare, TrendingDown, ShoppingBag,
  Bell, BarChart2, Users, ChevronDown, Store, LogOut, CreditCard, ShieldCheck
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Import from './pages/Import';
import PriceRules from './pages/PriceRules';
import SyncHistory from './pages/SyncHistory';
import Configuration from './pages/Configuration';
import CsvImport from './pages/CsvImport';
import AutoReplies from './pages/AutoReplies';
import Competition from './pages/Competition';
import Orders from './pages/Orders';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import MlAccounts from './pages/MlAccounts';
import MlCallback from './pages/MlCallback';
import Catalog from './pages/Catalog';
import AddLocalProduct from './pages/AddLocalProduct';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Register from './pages/Register';
import Pricing from './pages/Pricing';
import Subscription from './pages/Subscription';
import { AuthProvider, useAuth } from './context/AuthContext';
import { syncApi, authApi, alertsApi, mlAccountsApi } from './services/api';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

// Protege ruta /admin: solo is_admin: true
function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user?.is_admin) return <Navigate to="/login" replace />;
  return children;
}

// Protege rutas: redirige a /login si no hay sesión
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Cargando...</span>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.getStatus,
    refetchInterval: 60000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts-unread'],
    queryFn: alertsApi.getUnreadCount,
    refetchInterval: 30000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['ml-accounts'],
    queryFn: mlAccountsApi.list,
    refetchInterval: 120000,
  });

  const activeAccount = accounts.find(a => a.is_active);

  const syncMutation = useMutation({
    mutationFn: syncApi.syncPrices,
    onSuccess: (data) => {
      toast.success(`✅ Sync completada: ${data.updated || 0} productos actualizados`);
      queryClient.invalidateQueries(['stats']);
      queryClient.invalidateQueries(['products']);
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });

  const unreadAlerts = alertsData?.count || 0;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/catalog', icon: Store, label: 'Catálogo' },
    { to: '/products', icon: Package, label: 'Productos' },
    { to: '/import', icon: Download, label: 'Importar' },
    { to: '/csv-import', icon: FileUp, label: 'Importar CSV' },
    { to: '/orders', icon: ShoppingBag, label: 'Ventas' },
    { to: '/reports', icon: BarChart2, label: 'Reportes' },
    { to: '/competition', icon: TrendingDown, label: 'Competencia' },
    { to: '/auto-replies', icon: MessageSquare, label: 'Auto-respuestas' },
    { to: '/alerts', icon: Bell, label: 'Alertas', badge: unreadAlerts },
    { to: '/prices', icon: DollarSign, label: 'Precios' },
    { to: '/history', icon: History, label: 'Historial' },
    { to: '/ml-accounts', icon: Users, label: 'Cuentas ML' },
    { to: '/config', icon: Settings, label: 'Configuración' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="bg-amazon text-white text-xs font-semibold px-2 py-0.5 rounded">amazon</span>
          <span className="text-gray-400 text-lg">→</span>
          <span className="bg-yellow-400 text-gray-800 text-xs font-semibold px-2 py-0.5 rounded">Mercado Libre</span>
          <span className="text-gray-400 text-sm ml-1">Sync Manager</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Account selector */}
          {accounts.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5">
              <div className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-gray-800 font-bold text-xs">
                {(activeAccount?.nickname || 'ML')[0].toUpperCase()}
              </div>
              <span className="text-gray-700 font-medium">{activeAccount?.nickname || 'Sin cuenta'}</span>
              <ChevronDown size={11} className="text-gray-400" />
            </div>
          )}

          {/* Connection dots */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${authStatus?.amazon?.connected ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className="text-gray-500">Amazon</span>
            <span className={`w-2 h-2 rounded-full ml-2 ${authStatus?.mercadolibre?.connected ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className="text-gray-500">ML {authStatus?.mercadolibre?.user?.nickname && `(${authStatus.mercadolibre.user.nickname})`}</span>
          </div>

          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <button
            onClick={() => navigate('/config')}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
          >
            <Link2 size={14} />
            Conectar APIs
          </button>

          {/* User menu */}
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            {user?.avatar
              ? <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
              : <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                  {(user?.name || user?.email || 'U')[0].toUpperCase()}
                </div>
            }
            <div className="hidden md:block text-xs">
              <div className="font-medium text-gray-900 leading-tight">{user?.name || user?.email?.split('@')[0]}</div>
              <div className="text-gray-400 leading-tight">{user?.plan === 'pro' ? '✨ Pro' : 'Trial'}</div>
            </div>
            <div className="flex items-center gap-1 ml-1">
              <button onClick={() => navigate('/subscription')} title="Suscripción"
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <CreditCard size={14} />
              </button>
              <button onClick={logout} title="Cerrar sesión"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <nav className="w-52 bg-white border-r border-gray-200 py-4 flex-shrink-0 overflow-y-auto flex flex-col">
          <div className="flex-1">
            {navItems.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-4 py-2.5 text-sm mx-2 rounded-lg mb-0.5 transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
          {user?.is_admin && (
            <div className="px-2 pb-2 mt-2 border-t border-gray-100 pt-2">
              <NavLink
                to="/admin"
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-lg transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium"
              >
                <ShieldCheck size={16} />
                Panel Admin
              </NavLink>
            </div>
          )}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/add-local-product" element={<AddLocalProduct />} />
            <Route path="/products" element={<Products />} />
            <Route path="/import" element={<Import />} />
            <Route path="/csv-import" element={<CsvImport />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/competition" element={<Competition />} />
            <Route path="/auto-replies" element={<AutoReplies />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/prices" element={<PriceRules />} />
            <Route path="/history" element={<SyncHistory />} />
            <Route path="/ml-accounts" element={<MlAccounts />} />
            <Route path="/config" element={<Configuration />} />
            <Route path="/subscription" element={<Subscription />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Rutas públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Panel admin */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/auth/callback" element={<MlCallback />} />

            {/* Rutas protegidas */}
            <Route path="/*" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            } />
          </Routes>
          <Toaster position="bottom-right" />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
