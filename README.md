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
  - Cliente oficial `pg` con SSL y pool limitado por defecto a una conexión por instancia serverless (`PG_MAX` permite ajustarlo).
  - La inicialización de esquema es bajo demanda; modo memoria disponible en desarrollo sin conexión.
- **Panel de Administración (`/admin`):**
  - Formulario responsivo con campos completos y detalles opcionales plegables.
  - Protegido por `ADMIN_SECRET`; el navegador conserva el token en `localStorage` y lo envía en `x-admin-secret` al guardar.
  - Sin sondeos ni llamadas de prueba automáticas: solo se invoca el API al guardar.
- **Compatibilidad Dual Vercel Serverless / Express:**
  - Despliegue en 1 clic en Vercel vía `api/index.js` y `vercel.json`.
  - O ejecución como servidor independiente Node.js (`npm start`) para Docker o VPS.

---

## 🛠️ Arquitectura & Stack

- **Runtime:** Node.js (v18+)
- **Framework Web:** Express.js 4
- **Base de Datos:** PostgreSQL con cliente oficial `pg` (`Pool` con reconexión y `rejectUnauthorized: false` para Layerbase/Neon/Supabase)
- **CORS:** Habilitado para todos los orígenes (`*`) según especificación de addons de Stremio.
- **Frontend Admin & Landing:** páginas estáticas sin build; la portada usa recursos locales y `/admin` usa Tailwind Play CDN.

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
    subtitles VARCHAR(50) DEFAULT 'Multi', -- Ej: 'Español', 'Inglés', 'Multi'
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

El repositorio entrega la página pública y `/admin` como archivos estáticos. Solo los endpoints dinámicos (Stremio y API) usan funciones serverless; catálogos, metadatos, streams y `/api/vault` se cachean 60 segundos, y el manifiesto una hora.

### Pasos para desplegar:

1. **Importar el repositorio en Vercel:**
   - Ve a [vercel.com](https://vercel.com) y selecciona **Add New Project**.
   - Conecta tu repositorio `Hydra-Vault`.

2. **Configurar Variables de Entorno en Vercel:**
   En la sección **Environment Variables** del proyecto en Vercel, agrega:
   - `LAYERBASE_DATABASE_URL`: Tu URL completa de PostgreSQL Layerbase.
   - `ADMIN_SECRET`: Tu clave secreta administrativa.

   Si agregas o cambias estas variables después del último deploy, inicia un nuevo deploy para que Production las aplique. No compartas sus valores en el chat ni los pongas en el frontend.

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

El panel está pensado para mantener bajo el consumo de la versión gratuita:

1. Ingresa `ADMIN_SECRET` y completa título, enlace y tipo.
2. Abre **Más detalles** solo si necesitas cargar calidad, idioma o identificadores.
3. Pulsa **Guardar contenido**. El navegador hace un único `POST /api/admin/add`; no consulta métricas ni realiza pruebas automáticas.

`/admin` se entrega como archivo estático y no ejecuta una función de Vercel al abrirse. Tailwind se carga desde su CDN (petición externa al navegador; no es una función de Vercel). El token queda guardado en `localStorage` y se envía únicamente en la cabecera `x-admin-secret` al guardar. No uses la opción de recordar clave en un equipo compartido; `localStorage` es accesible para scripts ejecutados en el mismo origen.

---

## 📡 Referencia de la API REST

### Autenticación
Los endpoints protegidos requieren el token `ADMIN_SECRET` mediante cualquiera de estas opciones:
- Cabecera: `Authorization: Bearer <ADMIN_SECRET>`
- Cabecera: `x-admin-secret: <ADMIN_SECRET>`
- Query parameter: `?secret=<ADMIN_SECRET>`

---

### 1. Insertar Contenido en el Vault
**`POST /api/admin/add`** *(Protegido)*

**Cabeceras:**
```http
Content-Type: application/json
x-admin-secret: <ADMIN_SECRET>
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
  "magnet": "magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=The+Glory",
  "quality": "1080p",
  "audio_lang": "Latino / Coreano",
  "subtitles": "Español",
  "size": "14.2 GB",
  "seeders": 85
}
```

**Respuesta (201 Created):**
```json
{
  "success": true,
  "message": "Contenido insertado correctamente en Layerbase PostgreSQL.",
  "data": {
    "id": 1,
    "type": "drama",
    "source_platform": "Viki",
    "title": "The Glory S01 1080p Viki Dual Latino",
    "quality": "1080p",
    "audio_lang": "Latino / Coreano",
    "subtitles": "Español",
    "size": "14.2 GB",
    "seeders": 85
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
│   ├── index.html               # Landing pública estática
│   ├── admin.html               # Formulario de administración estático
│   ├── admin.js                 # Envío al API solo al guardar
│   ├── styles.css               # Estilos locales, sin CDN
│   └── favicon.svg              # Icono Hydra
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
│   └── utils/
│       ├── magnet.js            # Parser de magnets (BTIH Hex/Base32, trackers)
│       └── seedData.js          # Catálogo curado inicial de ejemplo
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
