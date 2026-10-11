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
- [Endpoints](#-endpoints)
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
  - Pega el magnet y se rellenan solos título, calidad, audio, plataforma, tamaño, temporada y episodio/capítulo.
  - Tipo con botones (Drama · Anime · Serie · Película), botones −/+ para temporada y episodio, `Ctrl + Enter` para guardar.
  - IDs de IMDb, Kitsu, TMDb y AniList aceptan la URL completa de la ficha; aviso si falta un ID.
  - Recuerda tus últimas opciones y muestra los guardados recientes (en el navegador, sin llamadas extra).
  - Sección **Tus datos**: busca entre lo guardado, filtra por tipo, selecciona con casillas (o *Seleccionar todo*) y elimina uno o varios registros a la vez; cada fila tiene su botón *Eliminar* individual y todo pide confirmación antes de borrar.
  - Evita duplicados exactos (mismo enlace, episodio, calidad, audio y subtítulos → `409`), pero permite **versiones**: el mismo episodio/película se puede repetir cambiando el audio, los subtítulos o la calidad (p. ej. *Latino* y *Dual Audio*).
  - Protegido por `ADMIN_SECRET`; el navegador conserva el token en `localStorage` y lo envía en `x-admin-secret` al guardar.
  - 100 % estático y local (sin Tailwind CDN): carga instantánea y solo contacta al servidor al guardar o gestionar datos.
- **Compatibilidad Dual Vercel Serverless / Express:**
  - Despliegue en 1 clic en Vercel vía `api/index.js` y `vercel.json`.
  - O ejecución como servidor independiente Node.js (`npm start`) para Docker o VPS.

---

## 🛠️ Arquitectura & Stack

- **Runtime:** Node.js (v18+)
- **Framework Web:** Express.js 4
- **Base de Datos:** PostgreSQL con cliente oficial `pg` (`Pool` con reconexión y `rejectUnauthorized: false` para Layerbase/Neon/Supabase)
- **CORS:** Habilitado para todos los orígenes (`*`) según especificación de addons de Stremio.
- **Frontend Admin & Landing:** páginas estáticas sin build ni CDN; ambas comparten `public/styles.css`.

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
    audio_lang VARCHAR(50) DEFAULT 'Multi',-- Ej: 'Latino', 'Sub Español', 'Inglés', 'Chino/Sub', 'Portugués', 'Polaco'
    subtitles VARCHAR(50) DEFAULT 'Multi', -- Ej: 'Español', 'Inglés', 'Chino', 'Polaco', 'Multi'
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

# Solo pruebas: insertar datos demo si la tabla está vacía (nunca en producción)
SEED_DEMO_DATA=false

# Entorno de Node ('production' o 'development')
NODE_ENV=production
```

> **Nota:** Si `LAYERBASE_DATABASE_URL` no está definida, la aplicación iniciará automáticamente en **Modo Memoria (Mock)** con títulos de muestra para facilitar pruebas locales y previsualización sin bloquear la ejecución.

---

## 🚀 Despliegue en Vercel Serverless

El repositorio entrega la página pública y `/admin` como archivos estáticos. Solo los endpoints dinámicos (Stremio y `POST /api/admin/add`) usan funciones serverless; catálogos, metadatos y streams se cachean 60 segundos, y el manifiesto una hora.

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

1. Ingresa `ADMIN_SECRET` una vez (queda guardada) y pega el enlace magnet: título, calidad, audio, tamaño y episodio se rellenan solos.
2. Según el **Tipo**, el formulario cambia solo:
   - **Película:** se ocultan temporada y episodio.
   - **Serie / Drama:** *Temporada* y *Episodio* obligatorios (se muestra como `T1 · E03`).
   - **Anime:** *Capítulo* obligatorio y *Temporada* opcional (se muestra como `Cap. 12`). Déjala vacía para numeración absoluta o IDs de Kitsu/AniList.
   - Si el título contiene `S01E03`, `1x03`, `Temporada 2`, `Capítulo 12`, `Episodio 5` o `Nombre - 12 (1080p)`, los números se rellenan automáticamente.
3. **Audio y subtítulos** con listas por idioma: español (Latino, Castellano, Sub Español, Dual, VOSE), inglés, coreano, chino (Mandarín/Cantonés), japonés, tailandés, filipino, hindi, tamil, telugu, vietnamita, indonesio, portugués (y PT-BR), francés, italiano, alemán, ruso, polaco, ucraniano, checo, húngaro, rumano, neerlandés, sueco, danés, noruego, finés, griego, turco, árabe, hebreo y persa. Con **Otro idioma…** se escribe cualquier valor libre (máx. 50 caracteres, igual que la columna `VARCHAR(50)`).
   El detector del magnet reconoce estos idiomas en el `dn` (`Inglés`/`Eng`, `Chino`/`CHS`/`Mandarin`, `Polaco`/`Polish`/`Lektor`, `Portugués`/`Dublado`, `Multi`, `Jap/Sub`…) y separa el idioma del audio de las marcas de subtítulos (`Sub Eng`, `Eng Sub`, `Multi Sub (Esp/Eng/Chn)`), que rellenan el campo *Subtítulos*.
4. Pega el ID o la URL de IMDb y/o Kitsu en **¿Dónde aparece en Stremio?**. Sin IMDb/Kitsu usa un **ID personalizado** (en *Más opciones*) para agrupar los episodios del mismo título.
5. Pulsa **Guardar** (o `Ctrl + Enter`). Tras guardar, el formulario conserva tipo, temporada e IDs y avanza al siguiente episodio/capítulo para cargar una temporada seguida.
   Puedes **repetir el mismo título o episodio** las veces que quieras: cada guardado con un **audio, subtítulos o calidad distinto** se guarda como una versión más (p. ej. el mismo episodio en *Latino* y en *Dual Audio / Sub Esp*). En Stremio aparecen todos como streams separados con su audio y subtítulos en la ficha. Solo se bloquea la repetición exacta (todo igual), típica del doble clic.
6. En **Tus datos** (al final del panel) ves todo lo guardado en la base de datos: busca por título/enlace/ID o filtra por tipo, marca los registros con las casillas (o *Seleccionar todo*) y pulsa **Eliminar seleccionados** — o elimina de uno en uno con el botón *Eliminar* de cada fila. Siempre se pide confirmación antes de borrar, y la lista indica cuántos registros hay y cuáles están marcados.
7. El navegador contacta al servidor solo para guardar (`POST /api/admin/add`), listar (`GET /api/admin/list`) y eliminar (`POST /api/admin/delete`); no consulta métricas ni realiza pruebas automáticas.

`/admin` se entrega como archivo estático y no ejecuta una función de Vercel al abrirse. El token queda guardado en `localStorage` y se envía únicamente en la cabecera `x-admin-secret` al guardar. No uses la opción de recordar clave en un equipo compartido; `localStorage` es accesible para scripts ejecutados en el mismo origen.

---

## 📡 Endpoints

La API REST de administración (`/api/vault`, `/api/health`, `/api/stats`, CRUD, bulk, parse-magnet) fue eliminada. Solo quedan los endpoints del panel de administración (guardar, listar y eliminar) y los endpoints de Stremio.

### Guardar contenido
**`POST /api/admin/add`** *(requiere cabecera `x-admin-secret: <ADMIN_SECRET>`)*

```json
{
  "imdb_id": "tt21344706",
  "kitsu_id": null,
  "type": "drama",
  "season": 1,
  "episode": 3,
  "episode_title": "La venganza",
  "source_platform": "Viki",
  "title": "The Glory S01E03 1080p Viki Dual Latino",
  "magnet": "magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=The+Glory",
  "quality": "1080p",
  "audio_lang": "Latino / Coreano",
  "subtitles": "Español",
  "size": "1.4 GB",
  "seeders": 85
}
```

Reglas de `season` / `episode` según `type`:

| `type` | `season` | `episode` | Ejemplo en Stremio |
|---|---|---|---|
| `movie` | se ignora (`null`) | se ignora (`null`) | — |
| `series`, `drama` | obligatorio (≥ 0) | obligatorio (≥ 1) | `T1 · E03` |
| `anime` | opcional | obligatorio — capítulo (≥ 1) | `Cap. 12` / `T2 · Cap. 05` |

**Versiones:** el mismo enlace puede guardarse varias veces para el mismo episodio siempre que cambie `audio_lang`, `subtitles` o `quality` (cada uno es una versión distinta: *Latino*, *Dual Audio*, *Remux*…). Solo se responde `409` cuando enlace, episodio, calidad, audio y subtítulos son exactamente iguales (doble clic).

### Gestionar datos (listar y eliminar)

**`GET /api/admin/list`** *(requiere cabecera `x-admin-secret: <ADMIN_SECRET>`)*

Lista los registros guardados para buscar, seleccionar y eliminar desde `/admin`. Parámetros de consulta:

| Parámetro | Descripción |
|---|---|
| `search` | Texto libre: busca en título, enlace, IDs (IMDb/TMDb/Kitsu/AniList/custom) y título del episodio. |
| `type` | Filtra por `anime`, `series`, `movie` o `drama`. |
| `page` | Página a partir de 1 (por defecto 1). |
| `limit` | Registros por página, 1–100 (por defecto 20). |

Respuesta: `{ "success": true, "data": { "items": [...], "total": 12, "page": 1, "pages": 3, "limit": 20 } }`.

**`POST /api/admin/delete`** *(requiere cabecera `x-admin-secret: <ADMIN_SECRET>`)*

Elimina uno o varios registros seleccionados. Cuerpo JSON con `{ "ids": [1, 2, 3] }` o un solo `{ "id": 1 }` (máximo 100 ids por petición). También acepta `DELETE`. Respuesta: `{ "success": true, "deleted": 2, "requested": 2, "ids": [1, 2] }` (incluye los ids realmente eliminados; los desconocidos simplemente no se borran).

### Endpoints nativos de Stremio
- `GET /manifest.json`: Manifiesto del addon (protocolo v3).
- `GET /stream/:type/:id.json`: Streams del título. Con episodio solo devuelve **ese** episodio/capítulo exacto y, detrás, los packs de temporada completa; nunca mezcla episodios.
  - `tt123:1:3` / `tmdb:55:1:3` → temporada 1, episodio 3 (anime sin temporada guardada cuenta como temporada 1).
  - `kitsu:46474:12` / `anilist:154587:12` → capítulo 12.
- `GET /catalog/:type/:id.json`: Catálogo navegable desde Stremio. El filtro *genre* acepta la plataforma (`Viki`, `iQiyi`, `Europa`, `América`), la calidad (`4K`, `1080p`) y el idioma (`Latino`, `Inglés`, `Chino`, `Portugués`, `Polaco`…), buscando también en `audio_lang` y `subtitles`.
- `GET /meta/:type/:id.json`: Metadatos con la lista ordenada de temporadas/episodios (`kitsu:ID:CAP` para anime con Kitsu).

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
│   ├── index.js                 # Punto de entrada para Vercel Serverless
│   └── admin/
│       ├── add.js               # POST /api/admin/add (guardar desde /admin)
│       ├── list.js              # GET /api/admin/list (buscar/listar desde /admin)
│       └── delete.js            # POST /api/admin/delete (eliminar seleccionados)
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
│   ├── routes/
│   │   └── stremio.js           # Rutas del protocolo Stremio Addon v3
│   ├── stremio/
│   │   ├── manifest.js          # Definición del manifiesto oficial v3
│   │   ├── streamHandler.js     # Resolución de streams para Stremio
│   │   ├── catalogHandler.js    # Proveedor de catálogos y filtros
│   │   └── metaHandler.js       # Proveedor de metadatos
│   └── utils/
│       ├── adminAuth.js         # Comparación segura del secreto x-admin-secret
│       ├── episodes.js          # Reglas de temporada/episodio/capítulo y parser de IDs de Stremio
│       ├── magnet.js            # Parser de magnets (BTIH Hex/Base32, trackers)
│       ├── titles.js            # Nombre limpio de la serie y pósters (Metahub / SVG)
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
- Seguridad del guardado (`401` y `201`) y reglas de temporada/episodio/capítulo por tipo.
- Que cada episodio de serie y cada capítulo de anime (IMDb y Kitsu) devuelva solo su propio stream.
- Catálogo agrupado (un elemento por título, nombre limpio, póster real), IDs desde URL y duplicados exactos (`409`), permitiendo versiones del mismo episodio con otro audio/subtítulos/calidad.

Para probar contra PostgreSQL real: `LAYERBASE_DATABASE_URL=postgres://… SEED_DEMO_DATA=true npm test` (usa una base vacía de pruebas).
- Estricta correspondencia con las columnas de `hydra_vault`.
- Renderizado de vistas HTML (`/` y `/admin`).

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
