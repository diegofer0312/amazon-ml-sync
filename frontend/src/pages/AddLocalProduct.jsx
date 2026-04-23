import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { catalogApi, formatCOP } from '../services/api';
import { Plus, Trash2, ArrowLeft, Package, DollarSign, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const DEFAULT_MARGIN = 0.30;

export default function AddLocalProduct() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    images: [''],
    supplier_name: '',
    supplier_price_cop: '',
    category: '',
    brand: '',
  });
  const [margin, setMargin] = useState(DEFAULT_MARGIN);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const suggestedPrice = form.supplier_price_cop
    ? Math.round(parseFloat(form.supplier_price_cop) * (1 + margin))
    : null;

  const mut = useMutation({
    mutationFn: () => catalogApi.addLocal({
      title: form.title.trim(),
      description: form.description.trim(),
      images: form.images.filter(u => u.trim()),
      supplier_name: form.supplier_name.trim(),
      supplier_price_cop: form.supplier_price_cop ? parseFloat(form.supplier_price_cop) : null,
      category: form.category.trim(),
      brand: form.brand.trim(),
    }),
    onSuccess: (data) => {
      setSuccess(data.id);
      setError('');
    },
    onError: (e) => setError(e.message),
  });

  const handleImageChange = (i, val) => {
    const imgs = [...form.images];
    imgs[i] = val;
    set('images', imgs);
  };

  const addImageRow = () => set('images', [...form.images, '']);
  const removeImageRow = (i) => set('images', form.images.filter((_, idx) => idx !== i));

  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-800">¡Producto añadido al catálogo!</h2>
        <p className="text-gray-500 text-sm">Ahora puedes publicarlo en Mercado Libre desde el Catálogo.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/catalog')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg">
            Ver catálogo
          </button>
          <button onClick={() => { setSuccess(null); setForm({ title: '', description: '', images: [''], supplier_name: '', supplier_price_cop: '', category: '', brand: '' }); setMargin(DEFAULT_MARGIN); }}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-lg">
            Añadir otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Añadir producto Dropi</h1>
          <p className="text-sm text-gray-500">Producto de Dropi o proveedor propio para publicar en Mercado Libre</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Basic info */}
        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Package className="w-4 h-4" />Información del producto</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ej: Audífonos Bluetooth Sony WH-1000XM5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input
                value={form.brand}
                onChange={e => set('brand', e.target.value)}
                placeholder="Sony"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <input
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="Electrónica"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              placeholder="Describe las características principales del producto..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Images */}
        <div className="p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">Imágenes (URLs)</h2>
          {form.images.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={url}
                onChange={e => handleImageChange(i, e.target.value)}
                placeholder={`https://...imagen${i + 1}.jpg`}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {form.images.length > 1 && (
                <button onClick={() => removeImageRow(i)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addImageRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-4 h-4" />Añadir imagen
          </button>
        </div>

        {/* Pricing */}
        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2"><DollarSign className="w-4 h-4" />Precio y proveedor</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
              <input
                value={form.supplier_name}
                onChange={e => set('supplier_name', e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio proveedor (COP)</label>
              <input
                type="number"
                value={form.supplier_price_cop}
                onChange={e => set('supplier_price_cop', e.target.value)}
                placeholder="150000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {form.supplier_price_cop && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-blue-800">Precio sugerido de venta en ML</p>
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs text-blue-600">Margen: {Math.round(margin * 100)}%</label>
                  <input
                    type="range" min="5" max="100" step="5"
                    value={Math.round(margin * 100)}
                    onChange={e => setMargin(parseInt(e.target.value) / 100)}
                    className="w-full mt-1"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-700">{formatCOP(suggestedPrice)}</p>
                  <p className="text-xs text-blue-500">precio costo × {(1 + margin).toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-3 pb-8">
        <button onClick={() => navigate(-1)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl">
          Cancelar
        </button>
        <button
          onClick={() => mut.mutate()}
          disabled={!form.title.trim() || mut.isPending}
          className="flex-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl disabled:opacity-60 flex items-center gap-2 justify-center"
        >
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Añadir al catálogo
        </button>
      </div>
    </div>
  );
}
