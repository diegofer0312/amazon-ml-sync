import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { csvApi, BASE_URL } from '../services/api';
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, Download } from 'lucide-react';

const EXAMPLE_CSV = `asin,markup,stock
B09JQMJHXY,25,5
B08N5WRWNW,20,10
B07ZPKBL9V,30,3`;

export default function CsvImport() {
  const [csvText, setCsvText] = useState('');
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const esRef = useRef(null);

  const importMutation = useMutation({
    mutationFn: () => csvApi.import(csvText),
    onSuccess: (data) => {
      setJobId(data.job_id);
      toast.success(`Importación iniciada: ${data.total} productos`);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!jobId) return;
    const url = `${BASE_URL}/csv/import/${jobId}/progress`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
      if (data.status === 'done' || data.status === 'error') {
        es.close();
        if (data.status === 'done') toast.success(`✅ Completado: ${data.success} importados, ${data.errors} errores`);
        else toast.error('Error en la importación');
      }
    };
    es.onerror = () => { es.close(); };
    return () => es.close();
  }, [jobId]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const percent = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Importación Masiva por CSV</h1>
      <p className="text-sm text-gray-500 mb-6">Sube un archivo CSV con columnas: <code className="bg-gray-100 px-1 rounded">asin</code>, <code className="bg-gray-100 px-1 rounded">markup</code>, <code className="bg-gray-100 px-1 rounded">stock</code></p>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-sm">
            <Upload size={15} />
            Subir archivo CSV
            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </label>
          <button
            onClick={() => setCsvText(EXAMPLE_CSV)}
            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700"
          >
            Usar ejemplo
          </button>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(EXAMPLE_CSV)}`}
            download="template.csv"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 ml-auto"
          >
            <Download size={12} /> Plantilla
          </a>
        </div>

        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={8}
          placeholder="asin,markup,stock&#10;B09JQMJHXY,25,5&#10;B08N5WRWNW,20,10"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
        />

        <div className="mt-3 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            {csvText ? `${csvText.trim().split('\n').length - 1} filas detectadas` : 'Vacío'}
          </p>
          <button
            onClick={() => importMutation.mutate()}
            disabled={!csvText.trim() || importMutation.isPending || (progress && progress.status === 'running')}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            <FileText size={14} />
            {importMutation.isPending ? 'Iniciando...' : 'Importar todos'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Progreso: {progress.processed} / {progress.total}
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              progress.status === 'done' ? 'bg-green-100 text-green-700' :
              progress.status === 'error' ? 'bg-red-100 text-red-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {progress.status === 'done' ? 'Completado' : progress.status === 'error' ? 'Error' : 'Procesando...'}
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex gap-4 text-sm mb-4">
            <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={14} /> {progress.success} OK</span>
            <span className="text-red-500 flex items-center gap-1"><XCircle size={14} /> {progress.errors} errores</span>
            <span className="text-gray-400 flex items-center gap-1"><AlertCircle size={14} /> {progress.processed - progress.success - progress.errors} saltados</span>
          </div>

          {progress.results && progress.results.length > 0 && (
            <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">ASIN</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Resultado</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {progress.results.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono">{r.asin}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          r.status === 'ok' ? 'bg-green-100 text-green-700' :
                          r.status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 truncate max-w-[200px]">{r.title || r.message || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
