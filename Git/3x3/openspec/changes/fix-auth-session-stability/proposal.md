## Why

Los usuarios autenticados con Google en 3x3 Hub son expulsados de la aplicación tras un rato de uso, aterrizando en una pantalla de "sin acceso", aunque su sesión debería seguir activa. Adicionalmente, la aplicación DBStats (mismo dominio GitHub Pages, misma base de datos Supabase) presenta fallos intermitentes en la carga de datos que se resuelven borrando la caché del navegador, lo que indica que el estado de autenticación de una app contamina a la otra vía `localStorage` compartido.

## What Changes

- **Corrección del listener `onAuthStateChange` en `AdminAuthGate`**: evitar que el evento `TOKEN_REFRESHED` desencadene una re-validación de admin completa (que puede hacer timeout y echar al usuario).
- **Aislamiento del almacenamiento de sesión Supabase**: ambas apps usan el mismo proyecto Supabase y se despliegan bajo el mismo origen (`chusmaris.github.io`), por lo que comparten la clave `localStorage` del token. Se añade `storageKey` único en cada `createClient` para aislarlas.
- **Ajuste del timeout de `is_admin()`**: el límite de 8 s es demasiado ajustado para Supabase free tier con cold-start; se aumenta y se añade lógica de reintento silencioso antes de marcar al usuario como no autorizado.
- **Limpieza de claves `localStorage` obsoletas**: la lógica de OAuth guarda varias claves (`supabase_oauth_route`, `supabase_admin_oauth_started_at`) que deben limpiarse correctamente en todos los flujos de salida.

## Capabilities

### New Capabilities

- `auth-session-isolation`: Aislamiento del almacenamiento de sesión Supabase entre las dos apps que comparten origen y proyecto, usando `storageKey` diferenciado en cada `createClient`.

### Modified Capabilities

<!-- No hay specs previos que cambien de requisito; esta es la primera iteración de specs formales para auth. -->

## Impact

- `src/lib/supabase.ts` (3x3): añadir opción `storageKey` al `createClient`.
- `src/components/AdminAuthGate.tsx` (3x3): filtrar eventos en `onAuthStateChange`; aumentar timeout; añadir retry.
- `supabaseClient.ts` (DBStats): añadir opción `storageKey` al `createClient` para evitar colisión con 3x3.
- Sin cambios en la base de datos ni en las políticas RLS.
- Sin cambios en el flujo OAuth visible por el usuario.
