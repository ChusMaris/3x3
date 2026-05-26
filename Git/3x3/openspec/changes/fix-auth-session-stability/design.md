## Context

Ambas apps (3x3 Hub y DBStats) están desplegadas en GitHub Pages bajo el mismo origen `chusmaris.github.io` (`/3x3/` y `/DBStats`). El cliente Supabase JS almacena por defecto la sesión en `localStorage` bajo la clave `sb-{projectRef}-auth-token`. Como ambas apps apuntan al mismo proyecto Supabase (`zvojniiaftqwdaggfvma`), comparten exactamente la misma clave de `localStorage`, lo que provoca interferencias cruzadas cuando el estado de sesión cambia en cualquiera de las dos.

Adicionalmente, `AdminAuthGate` suscribe `onAuthStateChange` y, ante cualquier evento (incluyendo `TOKEN_REFRESHED` que ocurre automáticamente cada ~50 min), vuelve a llamar al RPC `is_admin()` con un timeout de 8 s. Supabase free tier puede tardar más de 8 s en responder tras un cold-start, lo que hace que el timeout se dispare y el admin quede marcado como no autorizado sin que realmente haya perdido su sesión.

## Goals / Non-Goals

**Goals:**
- Evitar que el refresco automático del JWT expulse al admin de 3x3 Hub.
- Eliminar la interferencia entre 3x3 y DBStats a través del `localStorage` compartido.
- Aumentar la resiliencia del check `is_admin()` ante latencia de Supabase.
- No modificar la base de datos ni las políticas RLS.

**Non-Goals:**
- Cambiar el flujo OAuth visible por el usuario.
- Migrar DBStats a su propio proyecto Supabase.
- Implementar autenticación completa en DBStats (mantiene su modo admin por localStorage).

## Decisions

### D1 — `storageKey` diferenciado en cada `createClient`

**Decisión**: añadir `auth: { storageKey: 'sb-3x3-session' }` en el `createClient` de 3x3 y `auth: { storageKey: 'sb-dbstats-session' }` en el de DBStats.

**Alternativas descartadas**:
- _Migrar DBStats a un proyecto Supabase separado_: resuelve el problema de raíz pero requiere migración de datos y cambios en la base de datos; fuera de scope.
- _Borrar el token de DBStats al hacer logout en 3x3_: requeriría comunicación entre apps (BroadcastChannel), frágil y acoplado.

**Rationale**: el parámetro `storageKey` es la solución oficial de Supabase para usar múltiples instancias de cliente con el mismo proyecto en el mismo origen. No cambia nada en el servidor ni en el flujo OAuth.

### D2 — Filtrado de eventos en `onAuthStateChange`

**Decisión**: dentro del listener de `AdminAuthGate`, solo re-ejecutar `resolveAdminAuthorization()` ante los eventos `SIGNED_IN` e `INITIAL_SESSION`. Ignorar `TOKEN_REFRESHED` (el usuario ya estaba autenticado; solo se ha renovado el JWT). Ante `SIGNED_OUT` o `USER_DELETED`, limpiar estado inmediatamente sin llamar al RPC.

**Alternativas descartadas**:
- _Re-validar en todos los eventos_: comportamiento actual, causa el problema.
- _Cachear el resultado de `is_admin` en sessionStorage_: funciona, pero introduce stale data si el admin es revocado; el filtrado de eventos es más limpio.

### D3 — Timeout ampliado y sin penalización ante timeout en `TOKEN_REFRESHED`

**Decisión**: aumentar `ADMIN_CHECK_TIMEOUT_MS` de 8 000 ms a 15 000 ms. Para el boot inicial, si se produce timeout, mostrar un mensaje de reintento en lugar de marcar directamente como no autorizado.

**Rationale**: el cold-start de Supabase free tier puede superar fácilmente los 8 s. Un timeout no debe equivaler a "sin acceso"; puede equivaler a "no se pudo comprobar".

## Risks / Trade-offs

- **[Riesgo] Cambio de `storageKey` invalida la sesión activa de usuarios ya logados en 3x3**: al cambiar la clave de almacenamiento, el cliente no encontrará el token antiguo y pedirá al usuario que vuelva a iniciar sesión una sola vez. → Mitigación: aceptable como comportamiento puntual y único; los usuarios serán redirigidos al login de Google de forma transparente.
- **[Riesgo] DBStats también pierde su sesión anónima en caché**: al cambiar `storageKey` en DBStats, los datos de sesión anónima guardados se ignorarán. La app recargará datos de Supabase normalmente. → Mitigación: DBStats no usa sesiones persistentes con credenciales de usuario, solo RLS anónimo; el impacto es mínimo (carga de datos normal).
- **[Trade-off] Aumentar el timeout a 15 s retrasa el feedback al usuario**: si realmente no hay sesión, el spinner se mostrará 15 s. → Mitigación: aceptable dado que es un caso de cold-start esporádico; para boots normales el RPC responde en < 1 s.

## Migration Plan

1. Aplicar `storageKey` en `supabase.ts` (3x3) y `supabaseClient.ts` (DBStats) → desplegar.
2. Actualizar `AdminAuthGate.tsx` para filtrar eventos y ajustar timeout → desplegar.
3. Los usuarios de 3x3 que tengan sesión activa deberán autenticarse una vez más (se les redirigirá al flujo Google OAuth habitual).

## Open Questions

- ¿Debería notificarse a los usuarios de 3x3 que se les pedirá re-login puntualmente? (Puede añadirse un banner informativo, fuera de scope de este change.)
- ¿El equipo quiere que DBStats también use `VITE_` env vars en lugar de credenciales hardcodeadas? (Mejora de seguridad, separable en otro change.)
