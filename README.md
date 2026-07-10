# Terrascan — Frontend

Aplicación web para consultar el historial satelital de lotes rurales en Argentina. Permite dibujar o cargar la geometría de un campo, analizar índices de vegetación (NDVI), eventos térmicos e hidráulicos, y generar reportes. Interfaz orientada a productores y operadores del sector agropecuario.

> Repositorio público: este README describe el stack y cómo desarrollar localmente. Especificaciones de producto, bitácora de decisiones y reglas del equipo viven en archivos locales no versionados (ver [Documentación del equipo](#documentación-del-equipo)).

## Estado actual

El frontend es una aplicación **Next.js App Router** con shell SaaS (sidebar, dashboard, gestión de establecimientos y lotes). Funcionalidades principales ya implementadas:

| Área | Descripción |
|------|-------------|
| **Autenticación** | Login/registro y OAuth con Google vía Supabase Auth |
| **Mapa** | MapLibre GL + dibujo de polígono, búsqueda por ubicación, carga GeoJSON, segmentación con IA (SlimSAM en cliente) |
| **Análisis** | NDVI, incendios (FIRMS), riesgo hídrico y score de salud — datos reales vía backend NestJS |
| **Gestión** | Establecimientos, lotes, ficha de detalle con historial NDVI/térmico/hídrico |
| **Dashboard** | KPIs, matriz de riesgo, gráficos por establecimiento |
| **Reportes** | Generación de PDF en cliente (`@react-pdf/renderer`) y centro de descargas con URLs firmadas |

El procesamiento satelital y la persistencia corren en el **backend** (`../back/`). El mapa solo captura geometría; las API keys nunca llegan al navegador.

## Stack

| Tecnología | Uso |
|------------|-----|
| [Next.js 16](https://nextjs.org) (App Router) | Framework, SSR, rutas API locales |
| React 19 + TypeScript | UI |
| Tailwind CSS v4 | Estilos |
| [Radix Themes](https://www.radix-ui.com/themes) | Componentes y diseño AgTech dark |
| [MapLibre GL](https://maplibre.org/) + `@mapbox/mapbox-gl-draw` | Mapa interactivo y dibujo de lotes |
| [Supabase](https://supabase.com/) (`@supabase/ssr`) | Autenticación y sesión |
| [Recharts](https://recharts.org/) | Gráficos NDVI y dashboard |
| [@react-pdf/renderer](https://react-pdf.org/) | Reportes PDF |
| [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | Segmentación de lotes con SlimSAM (cliente) |
| [Turf.js](https://turfjs.org/) | Operaciones GeoJSON |

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  Navegador (React)                                      │
│  Mapa · Dashboard · Fichas de lote · PDF                │
└───────────────┬─────────────────────┬───────────────────┘
                │ Bearer (Supabase)   │ GeoJSON / REST
                ▼                     ▼
┌───────────────────────┐   ┌─────────────────────────────┐
│  Supabase Auth        │   │  Backend NestJS (:3001)      │
│  (sesión PKCE/OAuth)  │   │  Lotes · Análisis · GEE ·    │
└───────────────────────┘   │  Sentinel · FIRMS · Reportes │
                            └──────────────┬──────────────┘
                                           ▼
                            PostgreSQL (Supabase) + Storage
```

- **`src/services/`** — capa HTTP hacia el backend (`apiService`, `lotesService`, `dashboardService`, etc.).
- **`src/hooks/`** — estado y fetching por dominio (`useSaludLote`, `useNDVISerie`, `useDashboardData`, …).
- **`src/app/api/`** — proxies locales (p. ej. geocoding) que no requieren el backend.
- **`src/utils/supabase/`** — clientes browser y server para auth.

## Rutas principales

| Ruta | Descripción |
|------|-------------|
| `/` | Portal de acceso (login / registro) |
| `/auth/callback` | Callback OAuth (Supabase PKCE) |
| `/mapa` | Herramienta principal: mapa, análisis y creación de lotes |
| `/dashboard` | Panel analítico del usuario |
| `/establecimientos` | Listado de campos |
| `/establecimientos/[id]` | Detalle de establecimiento y sus lotes |
| `/establecimientos/[id]/lotes/[loteId]` | Ficha completa del lote |
| `/reportes` | Centro de descargas de reportes PDF |
| `/equipo` | Gestión de miembros (maqueta MVP) |
| `/configuracion` | Perfil y suscripción (maqueta MVP) |

Las rutas bajo `(app)/` comparten layout con sidebar fija.

## Estructura de carpetas

```
front/
├── src/
│   ├── app/                    # App Router (páginas, layouts, actions, api)
│   │   ├── (app)/              # Área autenticada con sidebar
│   │   ├── auth/callback/      # OAuth callback
│   │   └── actions/            # Server Actions (login, signup)
│   ├── components/             # UI por dominio (mapa, lote, dashboard, …)
│   ├── hooks/                  # Hooks de datos
│   ├── services/               # Clientes HTTP al backend
│   ├── lib/                    # Utilidades (geojson, rutas, bounds Pampea)
│   ├── types/                  # Tipos compartidos (p. ej. LoteAnalysisResult)
│   └── utils/supabase/         # Clientes Supabase SSR
├── public/
└── package.json
```

Convenciones relevantes:

- Componentes de mapa: solo en cliente (`'use client'` o `dynamic(..., { ssr: false })`).
- Polígono del lote: siempre `Feature<Polygon>` en GeoJSON.
- Rutas internas: builders en `src/lib/routes.ts`.

## Requisitos

- **Node.js** 20+ (recomendado; mínimo 18)
- **npm**
- **Backend NestJS** en ejecución (puerto `3001` por defecto) — ver `../back/README.md` si existe
- Cuenta **Supabase** con Auth configurado (email + Google OAuth opcional)

## Variables de entorno

Crear `front/.env.local` (no se versiona):

```env
# Backend NestJS
NEXT_PUBLIC_API_URL=http://localhost:3001

# Supabase Auth (valores públicos del proyecto)
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Opcional: bucket de reportes en Storage
NEXT_PUBLIC_SUPABASE_REPORTES_BUCKET=reportes
```

Las credenciales satelitales (Sentinel Hub, FIRMS, etc.) viven **solo en el backend**.

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar .env.local (ver sección anterior)

# 3. Levantar el backend (en otra terminal, desde ../back/)
# npm run start:dev

# 4. Servidor de desarrollo del front
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). La herramienta de mapa está en `/mapa` (requiere sesión).

### Verificación habitual

```bash
npx tsc --noEmit    # tipos
npm run lint        # ESLint
npm run build       # build de producción
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (hot reload) |
| `npm run build` | Build de producción |
| `npm run start` | Servir build (`next start`) |
| `npm run lint` | ESLint |

## Documentación del equipo

Archivos de trabajo internos **no incluidos en el repositorio** (ver `.gitignore`):

| Archivo | Propósito |
|---------|-----------|
| `MVP_SPEC.md` | Alcance, arquitectura y criterios del MVP |
| `HISTORIAL.md` | Bitácora de decisiones entre sesiones |
| `AGENTS.md` | Punto de entrada para agentes de IA |
| `.cursor/rules/` | Reglas de contexto y convenciones en Cursor |

Al retomar el trabajo: leer entradas recientes de `HISTORIAL.md` y, si aplica, `MVP_SPEC.md`. Tras cambios importantes, documentar en el historial según la regla `historial-proyecto`.

## Relación con el backend

El contrato HTTP sigue la forma de `src/types/loteAnalysis.ts`. Endpoints principales consumidos desde el front:

- `POST /api/lotes/analyze` — crear lote y disparar análisis
- `GET /api/lotes` — listado de lotes del usuario
- `GET/PATCH/DELETE /api/lotes/:id` — detalle, edición y borrado
- `GET /api/dashboard` — agregados del panel
- `GET/POST/DELETE /api/reportes` — centro de descargas

Todas las llamadas autenticadas envían `Authorization: Bearer <access_token>` de la sesión Supabase.

## Licencia

Proyecto privado. Todos los derechos reservados.
