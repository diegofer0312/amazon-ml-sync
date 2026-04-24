import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  LayoutDashboard, Users, CreditCard, Settings, Package, FileText,
  LogOut, RefreshCw, ToggleLeft, ToggleRight, Save, UserCheck, DollarSign,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    amber:  'text-amber-400  bg-amber-500/10',
    blue:   'text-blue-400   bg-blue-500/10',
    green:  'text-green-400  bg-green-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  };
  const cls = colors[color] || colors.amber;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`p-2 rounded-lg ${cls.split(' ')[1]}`}>
          <Icon size={16} className={cls.split(' ')[0]} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value ?? '—'}</div>
    </div>
  );
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function DashboardTab({ stats, loading, onRefresh }) {
  if (loading) return <Spinner />;
  return (
    <div>
      <SectionHeader title="Dashboard" onRefresh={onRefresh} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users}      label="Total usuarios"     value={stats?.total_users}        color="blue"   />
        <StatCard icon={UserCheck}  label="Suscs. activas"     value={stats?.pro_subscriptions}  color="green"  />
        <StatCard icon={DollarSign} label="Ingresos del mes"   value={stats?.monthly_revenue != null ? `$${stats.monthly_revenue}` : '$0'} color="amber"  />
        <StatCard icon={Package}    label="Productos"          value={stats?.total_products}     color="purple" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Resumen del sistema</h3>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <span className="text-gray-500">Usuarios activos</span>
            <span className="block text-white font-medium mt-0.5">{stats?.active_users ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Tasa de conversión</span>
            <span className="block text-white font-medium mt-0.5">
              {stats?.total_users
                ? `${Math.round((stats.pro_subscriptions / stats.total_users) * 100)}%`
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, loading, onToggle, onRefresh }) {
  return (
    <div>
      <SectionHeader title={`Usuarios (${users.length})`} onRefresh={onRefresh} />
      {loading ? <Spinner /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Nombre', 'Email / Teléfono', 'Plan', 'Registro', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-500">Sin usuarios registrados</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-white">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{u.email || u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={u.plan} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggle(u.id, u.is_active)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${
                        u.is_active
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      }`}
                    >
                      {u.is_active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                      {u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions tab ────────────────────────────────────────────────────────

function SubscriptionsTab({ users }) {
  return (
    <div>
      <SectionHeader title={`Suscripciones Pro (${users.length})`} />
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Usuario', 'Email', 'Plan', 'Vence'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10 text-gray-500">Sin suscripciones pro activas</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-gray-800/50">
                <td className="px-4 py-3 text-white">{u.name || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{u.email || '—'}</td>
                <td className="px-4 py-3"><PlanBadge plan="pro" /></td>
                <td className="px-4 py-3 text-gray-400">
                  {u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString('es-CO') : 'Sin vencimiento'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Config tab ───────────────────────────────────────────────────────────────

function ConfigTab({ config, onChange, onSave }) {
  const field = (key, label, extra = {}) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <input
        type="number"
        value={config[key]}
        onChange={e => onChange(c => ({ ...c, [key]: e.target.value }))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
        {...extra}
      />
    </div>
  );
  return (
    <div>
      <SectionHeader title="Configuración Global" />
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg space-y-5">
        {field('trm',            'TRM (USD → COP)')}
        {field('ml_commission',  'Comisión ML (ej: 0.11 = 11%)',     { step: '0.01' })}
        {field('default_margin', 'Margen por defecto (ej: 0.20 = 20%)', { step: '0.01' })}
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-gray-900 rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors"
        >
          <Save size={14} />
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

// ─── Products tab ─────────────────────────────────────────────────────────────

function ProductsTab({ headers }) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    axios.get(`${BASE_URL}/products`, { headers })
      .then(({ data }) => setCount(data.products?.length ?? (Array.isArray(data) ? data.length : 0)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <SectionHeader title="Productos en catálogo" />
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center max-w-xs">
        <Package size={40} className="text-amber-400 mx-auto mb-3" />
        <div className="text-4xl font-bold text-white mb-1">{count ?? '—'}</div>
        <p className="text-gray-400 text-sm">productos registrados</p>
      </div>
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

function LogsTab({ logs, loading, onRefresh }) {
  const levelColor = (lvl) => {
    if (lvl === 'error') return 'text-red-400';
    if (lvl === 'warn')  return 'text-yellow-400';
    return 'text-green-400';
  };
  return (
    <div>
      <SectionHeader title="Logs del sistema" onRefresh={onRefresh} />
      {loading ? <Spinner /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 font-mono text-xs overflow-auto max-h-[600px]">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No hay logs disponibles</p>
          ) : logs.map((log, i) => (
            <div key={i} className="flex gap-3 py-1.5 border-b border-gray-800/50">
              <span className="text-gray-600 w-44 shrink-0">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('es-CO') : ''}
              </span>
              <span className={`w-12 shrink-0 font-semibold ${levelColor(log.level)}`}>
                {(log.level || 'LOG').toUpperCase()}
              </span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SectionHeader({ title, onRefresh }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {onRefresh && (
        <button onClick={onRefresh} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 transition-colors">
          <RefreshCw size={13} />
          Actualizar
        </button>
      )}
    </div>
  );
}

function PlanBadge({ plan }) {
  const cls =
    plan === 'pro'   ? 'bg-amber-500/20 text-amber-400' :
    plan === 'admin' ? 'bg-red-500/20 text-red-400' :
    'bg-blue-500/20 text-blue-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{plan}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Admin() {
  const navigate  = useNavigate();
  const { user, logout, authHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats]         = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers]         = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [config, setConfig]       = useState({ trm: '4200', ml_commission: '0.11', default_margin: '0.20' });

  useEffect(() => {
    if (!user?.is_admin) navigate('/login');
  }, [user, navigate]);

  const headers = authHeaders();

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const { data } = await axios.get(`${BASE_URL}/admin/stats`, { headers: authHeaders() });
      setStats(data);
    } catch {
      toast.error('Error al cargar estadísticas');
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const { data } = await axios.get(`${BASE_URL}/admin/users`, { headers: authHeaders() });
      setUsers(data.users || []);
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const { data } = await axios.get(`${BASE_URL}/admin/logs`, { headers: authHeaders() });
      setLogs(data.logs || []);
    } catch {
      toast.error('Error al cargar logs');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'subscriptions') fetchUsers();
    if (activeTab === 'logs') fetchLogs();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleUser = async (id, isActive) => {
    try {
      await axios.put(`${BASE_URL}/admin/users/${id}`, { is_active: !isActive }, { headers: authHeaders() });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: isActive ? 0 : 1 } : u));
      toast.success(`Usuario ${isActive ? 'desactivado' : 'activado'}`);
    } catch {
      toast.error('Error al actualizar usuario');
    }
  };

  const saveConfig = async () => {
    try {
      await axios.put(`${BASE_URL}/admin/config`, config, { headers: authHeaders() });
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar configuración');
    }
  };

  const sidebarItems = [
    { id: 'dashboard',     icon: LayoutDashboard, label: 'Dashboard'      },
    { id: 'users',         icon: Users,           label: 'Usuarios'       },
    { id: 'subscriptions', icon: CreditCard,      label: 'Suscripciones'  },
    { id: 'config',        icon: Settings,        label: 'Configuración'  },
    { id: 'products',      icon: Package,         label: 'Productos'      },
    { id: 'logs',          icon: FileText,        label: 'Logs'           },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex text-white">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-gray-900 font-extrabold text-base">A</span>
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Panel Admin</div>
              <div className="text-xs text-amber-400 leading-tight">Diego</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {sidebarItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                activeTab === id
                  ? 'bg-amber-500/10 text-amber-400 border-r-2 border-amber-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between shrink-0">
          <div>
            <span className="text-sm font-semibold text-white">Panel de Administrador</span>
            <span className="ml-3 text-xs text-gray-500">
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-gray-900 font-bold text-xs">
              D
            </div>
            <span className="text-sm text-gray-300">Diego Admin</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'dashboard'     && <DashboardTab     stats={stats} loading={statsLoading} onRefresh={fetchStats} />}
          {activeTab === 'users'         && <UsersTab         users={users} loading={usersLoading} onToggle={toggleUser} onRefresh={fetchUsers} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab users={users.filter(u => u.plan === 'pro')} />}
          {activeTab === 'config'        && <ConfigTab        config={config} onChange={setConfig} onSave={saveConfig} />}
          {activeTab === 'products'      && <ProductsTab      headers={headers} />}
          {activeTab === 'logs'          && <LogsTab          logs={logs} loading={logsLoading} onRefresh={fetchLogs} />}
        </main>
      </div>
    </div>
  );
}
