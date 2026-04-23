import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { questionsApi } from '../services/api';
import { Plus, Trash2, Edit2, MessageSquare, Zap, CheckCircle2, X } from 'lucide-react';

function RuleForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [keywords, setKeywords] = useState(Array.isArray(initial.keywords) ? initial.keywords.join(', ') : '');
  const [template, setTemplate] = useState(initial.response_template || '');
  const [matchType, setMatchType] = useState(initial.match_type || 'any');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !keywords || !template) return toast.error('Completa todos los campos');
    onSave({ name, keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), response_template: template, match_type: matchType });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la regla</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: Consulta de envío" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de coincidencia</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={matchType} onChange={e => setMatchType(e.target.value)}>
            <option value="any">Cualquier palabra clave</option>
            <option value="all">Todas las palabras clave</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Palabras clave (separadas por coma)</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="envío, demora, cuánto tarda, entrega" value={keywords} onChange={e => setKeywords(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Respuesta automática</label>
        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3} placeholder="Hola! Los envíos demoran entre 3 y 7 días hábiles..."
          value={template} onChange={e => setTemplate(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          Guardar regla
        </button>
      </div>
    </form>
  );
}

export default function AutoReplies() {
  const [tab, setTab] = useState('rules');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [replyText, setReplyText] = useState({});
  const qc = useQueryClient();

  const { data: rules = [] } = useQuery({ queryKey: ['question-rules'], queryFn: questionsApi.getRules });
  const { data: questionsData } = useQuery({
    queryKey: ['questions'],
    queryFn: () => questionsApi.list({ status: 'UNANSWERED', limit: 30 }),
    enabled: tab === 'questions',
  });
  const { data: logs = [] } = useQuery({
    queryKey: ['question-logs'],
    queryFn: questionsApi.getLogs,
    enabled: tab === 'logs',
  });

  const createMutation = useMutation({
    mutationFn: questionsApi.createRule,
    onSuccess: () => { toast.success('Regla creada'); qc.invalidateQueries(['question-rules']); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => questionsApi.updateRule(id, data),
    onSuccess: () => { toast.success('Regla actualizada'); qc.invalidateQueries(['question-rules']); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: questionsApi.deleteRule,
    onSuccess: () => { toast.success('Regla eliminada'); qc.invalidateQueries(['question-rules']); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => questionsApi.updateRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries(['question-rules']),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, text }) => questionsApi.reply(id, text),
    onSuccess: (_, vars) => {
      toast.success('Respuesta enviada');
      setReplyText(p => { const n = { ...p }; delete n[vars.id]; return n; });
      qc.invalidateQueries(['questions']);
    },
    onError: (e) => toast.error(e.message),
  });

  const autoCheckMutation = useMutation({
    mutationFn: questionsApi.autoCheck,
    onSuccess: (data) => { toast.success(`Auto-respuesta: ${data.replied} preguntas respondidas`); qc.invalidateQueries(['questions']); },
    onError: (e) => toast.error(e.message),
  });

  const questions = questionsData?.questions || [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Respuestas Automáticas a Preguntas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configura respuestas automáticas basadas en palabras clave</p>
        </div>
        <button
          onClick={() => autoCheckMutation.mutate()}
          disabled={autoCheckMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 text-gray-900 text-sm rounded-lg hover:bg-yellow-500 disabled:opacity-60"
        >
          <Zap size={14} />
          {autoCheckMutation.isPending ? 'Procesando...' : 'Auto-responder ahora'}
        </button>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {[['rules', 'Reglas'], ['questions', 'Preguntas'], ['logs', 'Historial']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === k ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-3">
          {!showForm && !editing && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={15} /> Nueva regla
            </button>
          )}
          {showForm && (
            <RuleForm onSave={(data) => createMutation.mutate(data)} onCancel={() => setShowForm(false)} />
          )}
          {rules.map(rule => (
            <div key={rule.id}>
              {editing === rule.id ? (
                <RuleForm initial={rule}
                  onSave={(data) => updateMutation.mutate({ id: rule.id, data })}
                  onCancel={() => setEditing(null)} />
              ) : (
                <div className={`bg-white rounded-xl border p-4 ${!rule.is_active ? 'opacity-60' : 'border-gray-100'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare size={14} className="text-blue-500 flex-shrink-0" />
                        <span className="font-medium text-sm text-gray-900">{rule.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {rule.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {rule.keywords.map((kw, i) => (
                          <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{kw}</span>
                        ))}
                        <span className="text-xs text-gray-400">({rule.match_type === 'all' ? 'todas' : 'cualquiera'})</span>
                      </div>
                      <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 italic">"{rule.response_template}"</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
                        className="p-1.5 rounded hover:bg-gray-50" title={rule.is_active ? 'Desactivar' : 'Activar'}>
                        {rule.is_active ? <X size={13} className="text-gray-400" /> : <CheckCircle2 size={13} className="text-green-500" />}
                      </button>
                      <button onClick={() => setEditing(rule.id)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => { if (confirm('¿Eliminar?')) deleteMutation.mutate(rule.id); }}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {rules.length === 0 && !showForm && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              No hay reglas configuradas. Crea la primera.
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-3">
          {questions.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No hay preguntas sin responder</div>
          ) : questions.map(q => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">{q.item_id} · {new Date(q.date_created).toLocaleDateString('es-CO')}</p>
                  <p className="text-sm text-gray-800 mb-3">"{q.text}"</p>
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2} placeholder="Escribe tu respuesta..."
                      value={replyText[q.id] || ''}
                      onChange={e => setReplyText(p => ({ ...p, [q.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => replyMutation.mutate({ id: q.id, text: replyText[q.id] })}
                      disabled={!replyText[q.id] || replyMutation.isPending}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 self-end"
                    >
                      Responder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pregunta</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Respuesta</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{log.question_text || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-[220px] truncate">{log.answer_text}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${log.auto_replied ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                      {log.auto_replied ? 'Auto' : 'Manual'}
                    </span>
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
