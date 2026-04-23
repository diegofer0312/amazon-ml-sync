# Amazon → Mercado Libre Sync Manager

Sistema completo para sincronizar productos de Amazon a Mercado Libre Colombia (MCO).

## Características

- **Importar productos** desde Amazon usando URL o ASIN
- **Cargar imágenes automáticamente** de Amazon a Mercado Libre
- **Calcular precio en COP** automáticamente (TRM + margen + comisión ML)
- **Publicar en Mercado Libre** con un clic
- **Actualización automática de precios** (cron configurable)
- **TRM en tiempo real** desde el Banco de la República
- **Historial completo** de sincronizaciones
- **Dashboard** con estadísticas

---

## Estructura del proyecto

```
amazon-ml-sync/
├── backend/          # Node.js + Express + SQLite
│   ├── src/
│   │   ├── index.js         # Servidor principal
│   │   ├── database.js      # SQLite + esquemas
│   │   ├── services/
│   │   │   ├── amazon.js    # SP-API + scraping
│   │   │   └── mercadolibre.js  # ML API completa
│   │   ├── routes/
│   │   │   ├── products.js  # CRUD productos
│   │   │   ├── sync.js      # Sync + stats
│   │   │   ├── auth.js      # OAuth ML
│   │   │   └── config.js    # Configuración
│   │   └── jobs/
│   │       └── syncPrices.js  # Cron job
│   └── .env.example
│
└── frontend/         # React + Vite + Tailwind
    └── src/
        ├── App.jsx          # Routing + layout
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Import.jsx
        │   ├── Products.jsx
        │   ├── PriceRules.jsx
        │   ├── SyncHistory.jsx
        │   └── Configuration.jsx
        └── services/
            └── api.js       # Llamadas al backend
```

---

## Paso 1: Configurar Mercado Libre API

1. Ve a https://developers.mercadolibre.com.co
2. Crea una cuenta de desarrollador
3. Haz clic en **"Crear aplicación"**
4. Configura:
   - Nombre: `Amazon ML Sync`
   - URL de redirect: `http://localhost:3000/api/auth/callback`
   - Permisos: `read`, `write`, `offline_access`
5. Copia el **App ID** y **Secret Key**

## Paso 2: Configurar Amazon SP-API (opcional pero recomendado)

1. Ve a https://sellercentral.amazon.com
2. **Configuración > Credenciales de acceso**
3. Crea una aplicación nueva
4. Obtén: `Client ID`, `Client Secret`, `Refresh Token`
5. El `Marketplace ID` para Colombia es: `A2Q3Y263D00KWC`

> **Sin SP-API:** el sistema usa scraping automáticamente (puede fallar si Amazon bloquea)

## Paso 3: Instalar y arrancar el backend

```bash
cd backend

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales
nano .env   # o el editor que uses

# Instalar dependencias
npm install

# Arrancar en modo desarrollo
npm run dev
```

El backend corre en: **http://localhost:3001**

## Paso 4: Instalar y arrancar el frontend

```bash
cd frontend
npm install
npm run dev
```

La app corre en: **http://localhost:3000**

## Paso 5: Conectar Mercado Libre

1. Abre http://localhost:3000
2. Ve a **Configuración**
3. Haz clic en **"Conectar con Mercado Libre"**
4. Autoriza la aplicación en la ventana que se abre
5. ¡Listo! El token se guarda automáticamente

---

## Cómo usar

### Importar un producto de Amazon

1. Ve a **Importar**
2. Pega la URL de Amazon o el ASIN (ej: `B09JQMJHXY`)
3. El sistema obtiene: título, descripción, imágenes, precio
4. Ajusta el título, descripción, margen y stock
5. Haz clic en **"Publicar en Mercado Libre"**

### Actualización automática de precios

- Se ejecuta automáticamente según la frecuencia configurada
- Ve a **Reglas de precio** para cambiarla
- O usa el botón **"Sincronizar"** en la barra superior

### Cálculo de precio

```
Precio ML = (Precio_USD × TRM × (1 + Margen)) / (1 - Comisión_ML)
```

Ejemplo con $199 USD, TRM $4.200, margen 20%, comisión 11%:
- Base: $199 × $4.200 = $835.800
- Con margen: $835.800 × 1.20 = $1.002.960
- Con comisión: $1.002.960 / 0.89 = **$1.126.922**

---

## API del backend

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/products` | Listar productos |
| `POST` | `/api/products/import` | Importar desde Amazon |
| `PUT` | `/api/products/:id` | Editar producto |
| `POST` | `/api/products/:id/publish` | Publicar en ML |
| `POST` | `/api/sync/prices` | Sincronizar precios |
| `GET` | `/api/sync/stats` | Estadísticas dashboard |
| `GET` | `/api/sync/logs` | Historial |
| `GET` | `/api/config` | Ver configuración |
| `PUT` | `/api/config` | Actualizar configuración |
| `GET` | `/api/config/trm` | TRM actual |
| `GET` | `/api/auth/status` | Estado conexiones |
| `GET` | `/api/auth/ml` | URL OAuth ML |

---

## Despliegue en producción

### Backend (Railway / Render / VPS)

```bash
npm start
# PORT=3001 NODE_ENV=production
```

### Frontend (Vercel / Netlify)

```bash
npm run build
# Apunta VITE_API_URL a tu backend
```

### Variables de entorno para producción

Además de las del `.env.example`, cambia:
- `NODE_ENV=production`
- `ML_REDIRECT_URI=https://tu-dominio.com/api/auth/callback`

---

## Solución de problemas

### "Amazon bloqueó el scraping"
→ Configura las credenciales de Amazon SP-API en el `.env`

### "No se pudo renovar token de ML"
→ Ve a Configuración y vuelve a conectar tu cuenta de ML

### "Categoría no válida"
→ Edita el producto y selecciona la categoría correcta de ML manualmente

### El precio en ML es muy alto/bajo
→ Ajusta el margen en **Reglas de precio**
