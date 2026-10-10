# 🐉 Hydra Torrents - Stremio Addon & Admin Panel

> **Addon híbrido de alto rendimiento para Stremio con Panel de Administración web integrado, especializado en dramas asiáticos exclusivos (Viki, iQiyi), animes y rarezas cinematográficas curadas manualmente sobre Layerbase PostgreSQL y preparado para Vercel Serverless Functions o Express.**

---

## 📋 Tabla de Contenidos
- [Características Principales](#-características-principales)
- [Arquitectura & Stack](#-arquitectura--stack)
- [Esquema de Base de Datos (Layerbase PostgreSQL)](#-esquema-de-base-de-datos-layerbase-postgresql)
- [Variables de Entorno](#-variables-de-entorno)
- [Despliegue en Vercel Serverless](#-despliegue-en-vercel-serverless)
- [Ejecución Local / Servidor VPS](#-ejecución-local--servidor-vps)
- [Instalación en Stremio](#-instalación-en-stremio)
- [Panel de Administración Web](#-panel-de-administración-web)
- [Referencia de la API REST](#-referencia-de-la-api-rest)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Pruebas Automatizadas](#-pruebas-automatizadas)

---

## 🌟 Características Principales

- **Protocolo Stremio v3 Completo:**
  - `manifest.json`: Catálogos curados (*Dramas Viki/iQiyi*, *Anime Vault*, *Rare Movies*, *Curated Series*).
  - `/stream/{type}/{id}.json`: Resolución de torrents y enlaces directos con mapeo inteligente de IMDb (`tt...`), Kitsu (`kitsu:...`), TMDb (`tmdb:...`), AniList y Custom IDs.
  - `/catalog/{type}/{id}.json`: Navegación y filtrado por género, plataforma (Viki, iQiyi, Europa) y buscador integrado.
  - `/meta/{type}/{id}.json`: Metadatos y soporte de reproducción para títulos exclusivos o IDs personalizados.
- **Base de Datos PostgreSQL (Layerbase):**
  - Conexión optimizada mediante el cliente oficial `pg` con soporte SSL y pooling para entornos serverless.
  - Modo fallback en memoria automático para desarrollo local o pruebas sin conexión inmediata.
- **Panel de Administración Web Integrado (`/admin`):**
  - Autenticación segura mediante token secreto `ADMIN_SECRET`.
  - Dashboard con métricas en tiempo real (conteo por tipo, plataforma, promedio de seeders y latencia a PostgreSQL).
  - **Auto-Inspector de Enlaces Magnet:** analiza enlaces magnet extrayendo BTIH (Hex / Base32), display name, trackers y sugiere automáticamente calidad, idioma y tamaño.
  - **Simulador Interactivo de Stremio:** permite probar cualquier ID (`tt21344706`, `kitsu:41370:1`, `hydra:1`) y ver la respuesta JSON exacta que recibirá la aplicación Stremio.
  - Importación masiva (Bulk Import JSON/CSV) y botón para precargar catálogo curado (*Seed*).
- **Compatibilidad Dual Vercel Serverless / Express:**
  - Despliegue en 1 clic en Vercel vía `api/index.js` y `vercel.json`.
  - O ejecución como servidor independiente Node.js (`npm start`) para Docker o VPS.

---

## 🛠️ Arquitectura & Stack

- **Runtime:** Node.js (v18+)
- **Framework Web:** Express.js 4
- **Base de Datos:** PostgreSQL con cliente oficial `pg` (`Pool` con reconexión y `rejectUnauthorized: false` para Layerbase/Neon/Supabase)
- **CORS:** Habilitado para todos los orígenes (`*`) según especificación de addons de Stremio.
- **Frontend Admin & Landing:** Zero-build Vanilla JS moderno, responsivo con estética dark cyberpunk/streaming.

---

## 🗄️ Esquema de Base de Datos (Layerbase PostgreSQL)

El proyecto utiliza exactamente la tabla `hydra_vault` con la siguiente definición SQL:

```sql
CREATE TABLE hydra_vault (
    id SERIAL PRIMARY KEY,
    
    -- Identificadores multiplataforma
    imdb_id VARCHAR(50),
    tmdb_id VARCHAR(50),
    anilist_id VARCHAR(50),
    kitsu_id VARCHAR(50),
    custom_id VARCHAR(100),
    
    -- Metadatos y clasificación
    type VARCHAR(20) NOT NULL,             -- Valores: 'anime', 'series', 'movie', 'drama'
    source_platform VARCHAR(50) DEFAULT 'Torrent', -- Valores: 'Torrent', 'Viki', 'iQiyi', 'Direct', etc.
    title TEXT NOT NULL,                   -- Título descriptivo para Stremio
    magnet TEXT NOT NULL,                  -- Enlace Magnet o URL
    
    -- Detalles técnicos
    quality VARCHAR(20) DEFAULT '1080p',   -- Ej: '1080p', '4K', '720p'
    audio_lang VARCHAR(50) DEFAULT 'Multi',-- Ej: 'Latino', 'Sub Español', 'Jap/Sub'
    size VARCHAR(20) DEFAULT 'N/D',        -- Ej: '1.4 GB', '450 MB'
    seeders INT DEFAULT 10,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (basado en `.env.example`):

```bash
# Cadena de conexión PostgreSQL de Layerbase (con sslmode=require)
LAYERBASE_DATABASE_URL=postgres://usuario:password@db.layerbase.com:5432/hydra_db?sslmode=require

# Token secreto para autenticación en el panel y API de inserción
ADMIN_SECRET=mi_super_secreto_seguro_2026

# Puerto para modo Express independiente (por defecto: 7000)
PORT=7000

# Entorno de Node ('production' o 'development')
NODE_ENV=production
```

> **Nota:** Si `LAYERBASE_DATABASE_URL` no está definida, la aplicación iniciará automáticamente en **Modo Memoria (Mock)** con títulos de muestra para facilitar pruebas locales y previsualización sin bloquear la ejecución.

---

## 🚀 Despliegue en Vercel Serverless

El repositorio incluye `vercel.json` configurado para enrutar todas las peticiones a la función serverless `api/index.js`.

### Pasos para desplegar:

1. **Importar el repositorio en Vercel:**
   - Ve a [vercel.com](https://vercel.com) y selecciona **Add New Project**.
   - Conecta tu repositorio `Hydra-Vault`.

2. **Configurar Variables de Entorno en Vercel:**
   En la sección **Environment Variables** del proyecto en Vercel, agrega:
   - `LAYERBASE_DATABASE_URL`: Tu URL completa de PostgreSQL Layerbase.
   - `ADMIN_SECRET`: Tu clave secreta administrativa.

3. **Deploy:**
   - Haz clic en **Deploy**. Vercel generará tu URL pública (ejemplo: `https://hydra-vault.vercel.app`).
   - El manifiesto de Stremio estará disponible en: `https://hydra-vault.vercel.app/manifest.json`.
   - El panel de administración en: `https://hydra-vault.vercel.app/admin`.

---

## 💻 Ejecución Local / Servidor VPS

```bash
# 1. Clonar el repositorio
git clone https://github.com/noe359866-code/Hydra-Vault.git
cd Hydra-Vault

# 2. Instalar dependencias
npm install

# 3. Configurar entorno
cp .env.example .env
# Edita .env con tus credenciales

# 4. Iniciar servidor
npm start
# O en modo desarrollo:
npm run dev
```

El servidor escuchará en `http://localhost:7000`:
- **Landing pública de instalación:** `http://localhost:7000/`
- **Manifiesto Stremio:** `http://localhost:7000/manifest.json`
- **Panel de Administración:** `http://localhost:7000/admin`

---

## 📺 Instalación en Stremio

1. Abre la página principal de tu addon (`https://tu-dominio.vercel.app/` o `http://localhost:7000/`).
2. Pulsa el botón **"Instalar en Stremio"**.
   - Se abrirá automáticamente la aplicación Stremio en tu dispositivo (PC, Mac, Android, Fire TV o Stremio Web).
3. Alternativamente, copia la URL del manifiesto (`https://tu-dominio.vercel.app/manifest.json`) y pégala en la barra de búsqueda de addons de Stremio.

---

## 🛡️ Panel de Administración Web (`/admin`)

El panel ofrece una interfaz gráfica completa y reactiva:

1. **Acceso Seguro:** Ingresa tu `ADMIN_SECRET` para autenticarte. El token queda guardado de forma segura en tu sesión local.
2. **Dashboard de Métricas:** Visualiza el total de títulos, desglose por tipo (Dramas, Anime, Películas), promedio de seeders y estado de la conexión a Layerbase PostgreSQL con medición de latencia.
3. **Gestión de Entradas (+ Nueva Entrada / Editar):**
   - Formulario completo con todos los campos de la tabla `hydra_vault`.
   - Botón **"Auto-Inspeccionar Magnet"**: pega un enlace magnet y automáticamente se rellenará el título, la calidad inferida (4K/1080p), los subtítulos/idioma y los trackers.
4. **Importación Masiva (Bulk Import):** Inserta listas en formato JSON para migrar colecciones rápidamente.
5. **Cargar Ejemplos (Seed Data):** Precarga títulos curados de dramas coreanos y chinos de Viki e iQiyi (*The Glory*, *Love Between Fairy and Devil*, *Crash Landing on You*), animes y clásicos de cine.
6. **Simulador Stremio Integrado:** Ingresa cualquier IMDb ID (ej: `tt21344706`) o Kitsu ID (`kitsu:41370:1`) y obtén una previsualización visual de cómo se mostrarán las opciones de reproducción en Stremio y el JSON exacto.

---

## 📡 Referencia de la API REST

### Autenticación
Los endpoints protegidos requieren el token `ADMIN_SECRET` mediante cualquiera de estas opciones:
- Cabecera: `Authorization: Bearer <ADMIN_SECRET>`
- Cabecera: `x-admin-secret: <ADMIN_SECRET>`
- Query parameter: `?secret=<ADMIN_SECRET>`

---

### 1. Insertar Contenido en el Vault
**`POST /api/vault`** *(Protegido)*

**Cabeceras:**
```http
Content-Type: application/json
Authorization: Bearer mi_super_secreto_seguro_2026
```

**Cuerpo (JSON):**
```json
{
  "imdb_id": "tt21344706",
  "tmdb_id": "136283",
  "anilist_id": null,
  "kitsu_id": null,
  "custom_id": "viki-the-glory-s01",
  "type": "drama",
  "source_platform": "Viki",
  "title": "The Glory S01 1080p Viki Dual Latino",
  "magnet": "magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=The+Glory&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337",
  "quality": "1080p",
  "audio_lang": "Latino / Coreano",
  "size": "14.2 GB",
  "seeders": 85
}
```

**Respuesta (201 Created):**
```json
{
  "message": "Entrada creada exitosamente en Hydra Vault.",
  "data": {
    "id": 1,
    "imdb_id": "tt21344706",
    "tmdb_id": "136283",
    "anilist_id": null,
    "kitsu_id": null,
    "custom_id": "viki-the-glory-s01",
    "type": "drama",
    "source_platform": "Viki",
    "title": "The Glory S01 1080p Viki Dual Latino",
    "magnet": "magnet:?xt=urn:btih:...",
    "quality": "1080p",
    "audio_lang": "Latino / Coreano",
    "size": "14.2 GB",
    "seeders": 85,
    "created_at": "2026-10-10T17:00:00.000Z"
  }
}
```

---

### 2. Listar Entradas
**`GET /api/vault?type=drama&platform=Viki&search=glory&page=1&limit=50&sort=newest`**

---

### 3. Actualizar Entrada
**`PUT /api/vault/:id`** *(Protegido)*

```json
{
  "quality": "4K",
  "seeders": 120
}
```

---

### 4. Eliminar Entrada
**`DELETE /api/vault/:id`** *(Protegido)*

---

### 5. Importación Masiva
**`POST /api/vault/bulk`** *(Protegido)*

```json
{
  "entries": [
    {
      "title": "Drama 1",
      "magnet": "magnet:?...",
      "type": "drama",
      "source_platform": "Viki"
    },
    {
      "title": "Drama 2",
      "magnet": "magnet:?...",
      "type": "drama",
      "source_platform": "iQiyi"
    }
  ]
}
```

---

### 6. Analizador de Enlaces Magnet
**`POST /api/vault/parse-magnet`**

**Cuerpo:**
```json
{
  "magnet": "magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=Frieren+S01+1080p+Latino&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337"
}
```

**Respuesta:**
```json
{
  "parsed": {
    "isValid": true,
    "infoHash": "d624a91a92e105e45a20340b17163c4ff9841f84",
    "dn": "Frieren S01 1080p Latino",
    "sources": ["tracker:udp://tracker.opentrackr.org:1337"]
  },
  "suggestions": {
    "title": "Frieren S01 1080p Latino",
    "quality": "1080p",
    "audio_lang": "Latino",
    "size": "N/D"
  }
}
```

---

### 7. Endpoints Nativos de Stremio
- `GET /manifest.json`: Manifiesto del addon según el protocolo oficial v3.
- `GET /stream/:type/:id.json`: Devuelve `{ "streams": [ { "name": "...", "title": "...", "infoHash": "...", "sources": [...] } ] }`.
- `GET /catalog/:type/:id.json`: Catálogo navegable desde la interfaz de Stremio.
- `GET /meta/:type/:id.json`: Metadatos enriquecidos de reproducción.

---

## 📁 Estructura del Proyecto

```
Hydra-Vault/
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore                   # Archivos ignorados por Git
├── LICENSE                      # Licencia MIT
├── package.json                 # Dependencias y scripts de ejecución
├── server.js                    # Servidor Express independiente (0.0.0.0)
├── vercel.json                  # Configuración de rutas y rewrites de Vercel
├── api/
│   └── index.js                 # Punto de entrada para Vercel Serverless
├── public/
│   ├── favicon.svg              # Icono distintivo Hydra Glow
│   └── styles.css               # Estilos globales complementarios
├── src/
│   ├── app.js                   # Configuración de Express, CORS y middleware
│   ├── config.js                # Gestión centralizada de configuración
│   ├── db.js                    # Cliente PostgreSQL oficial 'pg' + Fallback en memoria
│   ├── middleware/
│   │   └── auth.js              # Middleware de verificación ADMIN_SECRET
│   ├── routes/
│   │   ├── api.js               # Rutas REST de administración y CRUD
│   │   └── stremio.js           # Rutas del protocolo Stremio Addon v3
│   ├── stremio/
│   │   ├── manifest.js          # Definición del manifiesto oficial v3
│   │   ├── streamHandler.js     # Resolución de streams para Stremio
│   │   ├── catalogHandler.js    # Proveedor de catálogos y filtros
│   │   └── metaHandler.js       # Proveedor de metadatos
│   ├── utils/
│   │   ├── magnet.js            # Parser de magnets (BTIH Hex/Base32, trackers)
│   │   └── seedData.js          # Catálogo curado inicial de ejemplo
│   └── views/
│       ├── adminView.js         # Panel de Control SPA integrado
│       └── landingView.js       # Landing page pública de instalación
└── test/
    └── test.js                  # Batería completa de pruebas unitarias y de integración
```

---

## 🧪 Pruebas Automatizadas

Ejecuta la suite completa de pruebas:

```bash
npm test
```

Valida:
- Conversión y extracción de hash BTIH en Hexadecimal (40 chars) y Base32 (32 chars).
- Extracción de trackers públicos y enlaces directos HTTP/HTTPS.
- Validez del protocolo Stremio v3 (`manifest.json`, stream resolution, catalog metas).
- Seguridad y autenticación en la API (`401`, `403` y `201`).
- Estricta correspondencia con las columnas de `hydra_vault`.
- Renderizado de vistas HTML (`/` y `/admin`).

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
