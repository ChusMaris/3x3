# Documento de Arquitectura — 3x3 Hub

> Aplicación web para la gestión y seguimiento en tiempo real de torneos de baloncesto 3x3.

---

## 1. Visión general

**3x3 Hub** es una SPA (_Single Page Application_) estática desplegada en GitHub Pages. No dispone de servidor propio: toda la lógica de negocio reside en el cliente y la persistencia se delega a **Supabase** como BaaS (_Backend-as-a-Service_). La aplicación expone dos zonas diferenciadas con acceso y permisos independientes:

| Zona | Ruta hash | Acceso |
|------|-----------|--------|
| Portal público | `/#/live` / `/#/live/:tournamentId` | Anónimo (solo lectura) |
| Panel de administración | `/#/admin` | Google OAuth + lista blanca de emails |

---

## 2. Stack tecnológico

### 2.1 Frontend

| Tecnología | Versión | Rol |
|---|---|---|
| **React** | 19 | Framework UI, componentes funcionales con Hooks |
| **TypeScript** | ~5.8 | Tipado estático end-to-end |
| **Vite** | 6 | Bundler y servidor de desarrollo (ESM nativo) |
| **Tailwind CSS** | 4 | Estilos utility-first (integrado vía plugin Vite) |
| **React Router DOM** | 7 | Enrutado cliente con `HashRouter` |
| **Motion (Framer Motion)** | 12 | Animaciones declarativas (`motion`, `AnimatePresence`) |
| **Lucide React** | ^0.546 | Librería de iconos SVG |
| **qrcode.react** | ^4.2 | Generación de códigos QR para URLs públicas |

### 2.2 Backend / Servicios externos

| Servicio | SDK | Propósito |
|---|---|---|
| **Supabase** | `@supabase/supabase-js` ^2 | Base de datos PostgreSQL, autenticación (Google OAuth), RLS |
| **Google OAuth** | Provisto por Supabase Auth | Identidad de administradores |
| **Google Gemini AI** | `@google/genai` ^1 | Capacidades de IA generativa (key configurada en build) |

### 2.3 Infraestructura y despliegue

| Herramienta | Versión | Rol |
|---|---|---|
| **GitHub Pages** | — | Hosting estático del bundle |
| **gh-pages** | ^6.3 | Script de despliegue (`npm run deploy`) |
| **dotenv** | ^17 | Gestión de variables de entorno en local |

---

## 3. Decisiones arquitectónicas relevantes

### 3.1 SPA estática con HashRouter

**Decisión**: se usa `HashRouter` en lugar de `BrowserRouter`.

**Razón**: GitHub Pages no soporta reescritura de rutas en el servidor. El prefijo `/#` garantiza que cualquier ruta es manejada por el cliente sin que el servidor devuelva 404. Esto también hace que los QR públicos (`/#/live`) funcionen sin configuración adicional.

**Consecuencia**: los redirects de OAuth de Supabase devuelven tokens en el fragmento de URL (`#access_token=...`), lo que colisiona con las rutas hash. Existe lógica explícita de normalización en `src/lib/supabase.ts` (`normalizeSupabaseOAuthHash`) y en `src/main.tsx` (`restoreSupabaseOAuthRoute`) para separar los parámetros OAuth de la ruta de navegación antes de que React Router los interprete.

### 3.2 Base path `/3x3/`

`vite.config.ts` define `base: '/3x3/'` para que los assets se sirvan correctamente desde el subdirectorio del repositorio en GitHub Pages.

### 3.3 Modo iteración (desarrollo vs. producción)

```
AdminAuthGate.tsx
const DEV_BYPASS = import.meta.env.DEV;
```

En modo desarrollo (`npm run dev`) el guard de autenticación se omite para acelerar la iteración local sin necesidad de credenciales Supabase. En producción el flujo completo de OAuth está activo. Las claves de entorno se inyectan en build-time con `VITE_` prefix (expuestas al bundle) y `GEMINI_API_KEY` a través del `define` de Vite.

**Variables de entorno requeridas** (fichero `.env.local`):
```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
GEMINI_API_KEY=<gemini-key>        # opcional, para features de IA
```

---

## 4. Modelo de datos

### 4.1 Tabla `tournaments`

```sql
CREATE TABLE public.tournaments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  event_date  DATE NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',  -- payload completo del torneo
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ                  -- soft-delete
);
```

El campo `data` (JSONB) almacena el estado completo del torneo como un blob flexible:

```ts
interface TournamentData {
  matches:         Match[];
  config:          ScheduleConfig;    // pistas, tiempos, playoffs, etc.
  teamInput:       string;
  teamsByCategory: Record<string, TeamData[]>;
  appCategories:   string[];
  isLocked:        boolean;
}
```

**Decisión de esquema plano + JSONB**: permite evolucionar el modelo de datos del torneo (añadir/quitar campos) sin migraciones de columnas. Los índices de PostgreSQL sobre `event_date` y `deleted_at` mantienen las queries eficientes.

### 4.2 Tabla `admin_users`

```sql
CREATE TABLE public.admin_users (
  email      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Lista blanca de correos autorizados para el panel de administración. Se compara con el JWT del usuario autenticado mediante la función `is_admin()`.

---

## 5. Seguridad

### 5.1 Modelo de seguridad en capas

```
┌─────────────────────────────────────────────┐
│  Cliente (React)                            │
│  ┌─────────────────────────────────────┐   │
│  │  AdminAuthGate                      │   │
│  │  • Google OAuth (Supabase Auth)     │   │
│  │  • Timeout 8 s en check de admin   │   │
│  └─────────────────────────────────────┘   │
└────────────────────┬────────────────────────┘
                     │  HTTPS + anon key
┌────────────────────▼────────────────────────┐
│  Supabase (PostgreSQL + Auth)               │
│  ┌─────────────────────────────────────┐   │
│  │  Row Level Security (RLS)           │   │
│  │  • SELECT público: solo torneos     │   │
│  │    activos (event_date >= today)    │   │
│  │    y no eliminados (deleted_at IS   │   │
│  │    NULL)                            │   │
│  │  • INSERT/UPDATE/DELETE: solo si    │   │
│  │    is_admin() = TRUE                │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  is_admin() — SECURITY DEFINER     │   │
│  │  Compara JWT email con             │   │
│  │  admin_users (case-insensitive)    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 5.2 Puntos clave de seguridad

- **Anon key pública**: la `VITE_SUPABASE_ANON_KEY` queda expuesta en el bundle (es por diseño en Supabase). La seguridad real la garantiza RLS, no la clave.
- **Doble factor admin**: un usuario necesita (1) sesión OAuth activa con Google **y** (2) su email en la tabla `admin_users`. No basta con tener cuenta de Google.
- **`SECURITY DEFINER`** en `is_admin()`: la función se ejecuta con privilegios del propietario, evitando escalada de privilegios desde el cliente.
- **Soft-delete**: los torneos nunca se eliminan físicamente; `deleted_at` filtra tanto en las políticas RLS como en las queries del cliente.
- **Timeout en check de admin** (`ADMIN_CHECK_TIMEOUT_MS = 8000`): previene bloqueos de UI si Supabase no responde; el usuario ve un error claro en lugar de una pantalla colgada.

---

## 6. Componentes principales

```
src/
├── main.tsx                  # Entrypoint: HashRouter, rutas, bootstrap OAuth
├── App.tsx                   # Vista de administración completa (estado global)
├── components/
│   ├── AdminAuthGate.tsx     # Guard de autenticación para /#/admin
│   ├── PublicLivePage.tsx    # Portal público de torneos activos
│   ├── LandingPage.tsx       # Selector de torneo (lista pública)
│   ├── ClassificationTable.tsx  # Tabla de clasificación por categoría
│   ├── PlayoffSection.tsx    # Árbol de playoffs
│   ├── TeamsManagementView.tsx  # CRUD de equipos por categoría
│   ├── CourtsManagementView.tsx # Configuración de pistas
│   ├── AddManualMatchForm.tsx   # Añadir partidos manualmente
│   └── ErrorBoundary.tsx     # Captura errores de render
├── lib/
│   ├── scheduler.ts          # Algoritmo puro de generación de horarios
│   └── supabase.ts           # Cliente Supabase + helpers OAuth + is_admin
├── hooks/
│   └── usePersistentCategories.ts  # localStorage para categorías
├── constants/
│   └── tournament.ts         # Categorías por defecto, config base
├── types/
│   └── tournament.ts         # Interfaces TypeScript del dominio
└── utils/
    └── categoryStyles.ts     # Estilos visuales por categoría
```

### 6.1 Algoritmo de scheduling (`lib/scheduler.ts`)

Módulo **puro** (sin efectos secundarios ni llamadas a red) que recibe la configuración del torneo y devuelve el calendario de partidos. Soporta:

- Fase de **Liga** (round-robin) y **Playoffs** (eliminatorias)
- Asignación de pistas con tipos de aro (`normal` / `low`) y categorías permitidas
- Pausas generales configurables
- Grupos manuales por categoría
- Fase de relleno opcional (`useFillPhase`) para maximizar uso de pistas
- Umbral de equipos configurable para activar playoffs (`playoffThreshold`)

### 6.2 Persistencia local (`usePersistentCategories`)

Las categorías del torneo activo se sincronizan con `localStorage` como caché de UI. La fuente de verdad siempre es Supabase: al cargar un torneo, las categorías se restauran desde `Tournament.data.appCategories`.

---

## 7. Flujo de datos

```
Usuario público                 Usuario admin
      │                               │
      ▼                               ▼
 /#/live                         /#/admin
      │                               │
      │                         AdminAuthGate
      │                         (Google OAuth)
      │                               │
      ▼                               ▼
PublicLivePage                     App.tsx
      │                               │
      └──────────┬────────────────────┘
                 │
         supabase.from('tournaments')
                 │
         Row Level Security
                 │
    ┌────────────┴────────────┐
    │     PostgreSQL           │
    │   + JSONB data field     │
    └─────────────────────────┘
```

El cliente **nunca** escribe datos directamente a través de la clave anon sin autenticación: RLS rechaza cualquier mutación que no supere `is_admin()`.

---

## 8. Despliegue

```
npm run build    →  Vite compila a /dist  (base: /3x3/)
npm run deploy   →  gh-pages publica /dist en rama gh-pages
```

El script `predeploy` ejecuta `build` automáticamente antes de `deploy`. No hay CI/CD configurado; el despliegue es manual desde la máquina del desarrollador.

---

## 9. Dependencias externas y sus contratos

| Dependencia | Tipo de contrato | Degradación si no está disponible |
|---|---|---|
| Supabase | HTTPS REST + WebSocket Realtime | App muestra error; portal público no carga torneos |
| Google OAuth (vía Supabase) | Redirect OAuth 2.0 | Admin no puede iniciar sesión; portal público sigue funcionando |
| Google Gemini AI | HTTPS REST | Features de IA deshabilitadas silenciosamente |
| GitHub Pages | CDN estático | App completamente inaccesible |

---

## 10. Limitaciones conocidas y deuda técnica

- **Sin CI/CD**: el despliegue es manual; no hay pipeline de tests automatizados.
- **Sin tests unitarios**: el algoritmo de scheduling es complejo y no tiene cobertura de tests.
- **`VITE_` keys en bundle**: las claves de Supabase y Gemini quedan en el JS del cliente. Aceptable para anon key + RLS; para Gemini la clave debería moverse a un edge function si se expone a usuarios no confiables.
- **Estado global en `App.tsx`**: todo el estado de administración vive en un único componente; candidato a refactorización con Context o Zustand si crece más.
- **`localStorage` como caché de categorías**: puede desfasarse respecto a la BD en sesiones largas sin refresco.
