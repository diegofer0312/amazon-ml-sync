import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  LayoutDashboard, Users, CreditCard, Settings, Package, FileText,
  LogOut, RefreshCw, Save, UserCheck, DollarSign, Plus, Trash2,
  UserX, LayoutGrid, X, CalendarDays, ChevronRight,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const PLANS = [
  { value: 'trial',   label: 'Trial (7 días)' },
  { value: 'monthly', label: 'Mensual ($100 USD)' },
  { value: 'annual',  label: 'Anual ($1000 USD)' },
  { value: 'pro',     label: 'Pro personalizado' },
  { value: 'custom',  label: 'Personalizado' },
];

const PAYMENT_METHODS = [
  { value: 'cash',        label: 'Efectivo' },
  { value: 'transfer',    label: 'Transferencia' },
  { value: 'nequi',       label: 'Nequi' },
  { value: 'daviplata',   label: 'Daviplata' },
  { value: 'stripe',      label: 'Stripe' },
  { value: 'gift',        label: 'Gratis (regalo)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SectionHeader({ title, onRefresh, extra }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="flex items-center gap-2">
        {extra}
        {onRefresh && (
          <button onClick={onRefresh} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 transition-colors">
            <RefreshCw size={13} />
            Actualizar
          </button>
        )}
      </div>
    </div>
  );
}

function PlanBadge({ plan }) {
  const cls =
    plan === 'pro'     ? 'bg-amber-500/20 text-amber-400' :
    plan === 'annual'  ? 'bg-purple-500/20 text-purple-400' :
    plan === 'monthly' ? 'bg-green-500/20  text-green-400' :
    plan === 'admin'   ? 'bg-red-500/20    text-red-400' :
    'bg-blue-500/20 text-blue-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{plan}</span>;
}

function PaymentBadge({ method }) {
  if (!method) return <span className="text-gray-600 text-xs">—</span>;
  const labels = { cash: 'Efectivo', transfer: 'Transferencia', nequi: 'Nequi', daviplata: 'Daviplata', stripe: 'Stripe', gift: 'Regalo' };
  return <span className="text-xs text-gray-400">{labels[method] || method}</span>;
}

function InputField({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
        {...props}
      />
    </div>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ModalOverlay({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated, getHeaders }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    plan: 'trial', payment_method: 'cash', payment_notes: '', expires_at: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post(`${BASE_URL}/admin/users/create`, form, { headers: getHeaders() });
      toast.success(`Usuario ${data.user.name || data.user.email || data.user.phone} creado`);
      onCreated(data.user);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title="Agregar usuario manualmente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Nombre completo" value={form.name} onChange={set('name')} placeholder="Juan Pérez" />
          <InputField label="Contraseña temporal" type="password" value={form.password} onChange={set('password')} placeholder="Opcional" />
        </div>
        <InputField label="Email" type="email" value={form.email} onChange={set('email')} placeholder="juan@email.com" />
        <InputField label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} placeholder="+57 300 000 0000" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Plan" value={form.plan} onChange={set('plan')} options={PLANS} />
          <SelectField label="Método de pago" value={form.payment_method} onChange={set('payment_method')} options={PAYMENT_METHODS} />
        </div>
        {(form.plan === 'custom' || form.plan === 'pro') && (
          <InputField label="Fecha de expiración" type="date" value={form.expires_at} onChange={set('expires_at')} />
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notas del pago (opcional)</label>
          <textarea
            value={form.payment_notes}
            onChange={set('payment_notes')}
            rows={2}
            placeholder="Ej: Pagó en efectivo en reunión, recibo #123..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-amber-500 text-gray-900 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />}
          {loading ? 'Creando...' : 'Crear usuario y activar'}
        </button>
      </form>
    </ModalOverlay>
  );
}

// ─── Renew Modal ──────────────────────────────────────────────────────────────

function RenewModal({ user, onClose, onRenewed, getHeaders }) {
  const [form, setForm] = useState({
    plan: user.plan || 'monthly',
    expires_at: '',
    payment_method: user.payment_method || 'cash',
    payment_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.put(`${BASE_URL}/admin/users/${user.id}/subscription`, form, { headers: getHeaders() });
      toast.success('Suscripción renovada');
      onRenewed(data.user);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al renovar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title={`Renovar — ${user.name || user.email || user.phone}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <SelectField label="Nuevo plan" value={form.plan} onChange={set('plan')} options={PLANS} />
        <InputField label="Fecha de expiración (deja en blanco para auto)" type="date" value={form.expires_at} onChange={set('expires_at')} />
        <SelectField label="Método de pago" value={form.payment_method} onChange={set('payment_method')} options={PAYMENT_METHODS} />
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notas del pago</label>
          <textarea
            value={form.payment_notes}
            onChange={set('payment_notes')}
            rows={2}
            placeholder="Opcional..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-1 bg-amber-500 text-gray-900 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /> : <CalendarDays size={14} />}
          {loading ? 'Guardando...' : 'Confirmar renovación'}
        </button>
      </form>
    </ModalOverlay>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, loading, onRefresh, onSuspend, onActivate, onDelete, onUserCreated, onUserRenewed, getHeaders }) {
  const [showCreate, setShowCreate] = useState(false);
  const [renewUser, setRenewUser]   = useState(null);

  const cols = ['Nombre', 'Email / Teléfono', 'Plan', 'Expiración', 'Estado', 'M. Pago', 'Acciones'];

  return (
    <div>
      <SectionHeader
        title={`Usuarios (${users.length})`}
        onRefresh={onRefresh}
        extra={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-colors"
          >
            <Plus size={13} />
            Agregar usuario
          </button>
        }
      />

      {loading ? <Spinner /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-800">
                {cols.map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-500">Sin usuarios registrados</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{u.name || '—'}</div>
                    {u.created_by === 'admin' && (
                      <span className="text-xs text-amber-500/70">creado por admin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-[160px] truncate">{u.email || u.phone || '—'}</td>
                  <td className="px-4 py-3"><PlanBadge plan={u.plan} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {u.plan_expires_at
                      ? new Date(u.plan_expires_at).toLocaleDateString('es-CO')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.suspended_at ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-orange-500/20 text-orange-400">Suspendido</span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><PaymentBadge method={u.payment_method} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setRenewUser(u)}
                        className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                        title="Renovar suscripción"
                      >
                        <CalendarDays size={10} />
                        Renovar
                      </button>
                      {u.is_active && !u.suspended_at ? (
                        <button
                          onClick={() => onSuspend(u.id)}
                          className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors flex items-center gap-1"
                          title="Suspender"
                        >
                          <UserX size={10} />
                          Suspender
                        </button>
                      ) : (
                        <button
                          onClick={() => onActivate(u.id)}
                          className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1"
                          title="Activar"
                        >
                          <UserCheck size={10} />
                          Activar
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(u.id, u.name || u.email || u.phone)}
                        className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                        title="Eliminar"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={onUserCreated}
          getHeaders={getHeaders}
        />
      )}
      {renewUser && (
        <RenewModal
          user={renewUser}
          onClose={() => setRenewUser(null)}
          onRenewed={onUserRenewed}
          getHeaders={getHeaders}
        />
      )}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
  const colors = { amber: 'text-amber-400 bg-amber-500/10', blue: 'text-blue-400 bg-blue-500/10', green: 'text-green-400 bg-green-500/10', purple: 'text-purple-400 bg-purple-500/10' };
  const cls = colors[color] || colors.amber;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`p-2 rounded-lg ${cls.split(' ')[1]}`}><Icon size={16} className={cls.split(' ')[0]} /></div>
      </div>
      <div className="text-2xl font-bold text-white">{value ?? '—'}</div>
    </div>
  );
}

function DashboardTab({ stats, loading, onRefresh }) {
  if (loading) return <Spinner />;
  return (
    <div>
      <SectionHeader title="Dashboard" onRefresh={onRefresh} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users}      label="Total usuarios"   value={stats?.total_users}       color="blue"   />
        <StatCard icon={UserCheck}  label="Suscs. activas"   value={stats?.pro_subscriptions} color="green"  />
        <StatCard icon={DollarSign} label="Ingresos del mes" value={`$${stats?.monthly_revenue ?? 0}`} color="amber" />
        <StatCard icon={Package}    label="Productos"        value={stats?.total_products}    color="purple" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Resumen</h3>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <span className="text-gray-500">Usuarios activos</span>
            <span className="block text-white font-medium mt-0.5">{stats?.active_users ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Tasa de conversión</span>
            <span className="block text-white font-medium mt-0.5">
              {stats?.total_users ? `${Math.round((stats.pro_subscriptions / stats.total_users) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────────────────

function SubscriptionsTab({ users }) {
  const active = users.filter(u => u.plan !== 'trial' && u.plan !== 'admin');
  return (
    <div>
      <SectionHeader title={`Suscripciones activas (${active.length})`} />
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Usuario', 'Email', 'Plan', 'M. Pago', 'Vence', 'Estado'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-500">Sin suscripciones activas</td></tr>
            ) : active.map(u => (
              <tr key={u.id} className="border-b border-gray-800/50">
                <td className="px-4 py-3 text-white">{u.name || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{u.email || u.phone || '—'}</td>
                <td className="px-4 py-3"><PlanBadge plan={u.plan} /></td>
                <td className="px-4 py-3"><PaymentBadge method={u.payment_method} /></td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString('es-CO') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab({ config, onChange, onSave }) {
  const field = (key, label, extra = {}) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg space-y-4">
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

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ getHeaders }) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    axios.get(`${BASE_URL}/products`, { headers: getHeaders() })
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

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

function LogsTab({ logs, loading, onRefresh }) {
  const c = lvl => lvl === 'error' ? 'text-red-400' : lvl === 'warn' ? 'text-yellow-400' : 'text-green-400';
  return (
    <div>
      <SectionHeader title="Logs del sistema" onRefresh={onRefresh} />
      {loading ? <Spinner /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 font-mono text-xs overflow-auto max-h-[600px]">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No hay logs disponibles</p>
          ) : logs.map((log, i) => (
            <div key={i} className="flex gap-3 py-1.5 border-b border-gray-800/40">
              <span className="text-gray-600 w-44 shrink-0">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('es-CO') : ''}
              </span>
              <span className={`w-12 shrink-0 font-semibold ${c(log.level)}`}>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Admin() {
  const navigate = useNavigate();
  const { user, logout, authHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats]         = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers]         = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [config, setConfig]       = useState({ trm: '4200', ml_commission: '0.11', default_margin: '0.20' });

  useEffect(() => { if (!user?.is_admin) navigate('/login'); }, [user, navigate]);

  const fetchStats = async () => {
    try { setStatsLoading(true); const { data } = await axios.get(`${BASE_URL}/admin/stats`, { headers: authHeaders() }); setStats(data); }
    catch { toast.error('Error al cargar estadísticas'); }
    finally { setStatsLoading(false); }
  };

  const fetchUsers = async () => {
    try { setUsersLoading(true); const { data } = await axios.get(`${BASE_URL}/admin/users`, { headers: authHeaders() }); setUsers(data.users || []); }
    catch { toast.error('Error al cargar usuarios'); }
    finally { setUsersLoading(false); }
  };

  const fetchLogs = async () => {
    try { setLogsLoading(true); const { data } = await axios.get(`${BASE_URL}/admin/logs`, { headers: authHeaders() }); setLogs(data.logs || []); }
    catch { toast.error('Error al cargar logs'); }
    finally { setLogsLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'subscriptions') fetchUsers();
    if (activeTab === 'logs') fetchLogs();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const suspendUser = async (id) => {
    try {
      await axios.put(`${BASE_URL}/admin/users/${id}/suspend`, {}, { headers: authHeaders() });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: 0, suspended_at: new Date().toISOString() } : u));
      toast.success('Usuario suspendido');
    } catch { toast.error('Error al suspender'); }
  };

  const activateUser = async (id) => {
    try {
      await axios.put(`${BASE_URL}/admin/users/${id}/activate`, {}, { headers: authHeaders() });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: 1, suspended_at: null } : u));
      toast.success('Usuario activado');
    } catch { toast.error('Error al activar'); }
  };

  const deleteUser = async (id, label) => {
    if (!window.confirm(`¿Eliminar a "${label}"? Esta acción no se puede deshacer.`)) return;
    try {
      await axios.delete(`${BASE_URL}/admin/users/${id}`, { headers: authHeaders() });
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success('Usuario eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  const saveConfig = async () => {
    try { await axios.put(`${BASE_URL}/admin/config`, config, { headers: authHeaders() }); toast.success('Configuración guardada'); }
    catch { toast.error('Error al guardar'); }
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

        <div className="p-4 border-t border-gray-800 space-y-1">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
          >
            <LayoutGrid size={14} />
            Ir a la App
            <ChevronRight size={12} className="ml-auto" />
          </button>
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
            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-gray-900 font-bold text-xs">D</div>
            <span className="text-sm text-gray-300">Diego Admin</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'dashboard'     && <DashboardTab     stats={stats} loading={statsLoading} onRefresh={fetchStats} />}
          {activeTab === 'users'         && (
            <UsersTab
              users={users}
              loading={usersLoading}
              onRefresh={fetchUsers}
              onSuspend={suspendUser}
              onActivate={activateUser}
              onDelete={deleteUser}
              onUserCreated={u => setUsers(prev => [u, ...prev])}
              onUserRenewed={u => setUsers(prev => prev.map(x => x.id === u.id ? u : x))}
              getHeaders={authHeaders}
            />
          )}
          {activeTab === 'subscriptions' && <SubscriptionsTab users={users} />}
          {activeTab === 'config'        && <ConfigTab        config={config} onChange={setConfig} onSave={saveConfig} />}
          {activeTab === 'products'      && <ProductsTab      getHeaders={authHeaders} />}
          {activeTab === 'logs'          && <LogsTab          logs={logs} loading={logsLoading} onRefresh={fetchLogs} />}
        </main>
      </div>
    </div>
  );
}
