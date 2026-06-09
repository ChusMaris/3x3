## 1. Aislamiento de sesión Supabase (storageKey)

- [x] 1.1 En `src/lib/supabase.ts` (3x3), añadir `auth: { storageKey: 'sb-3x3-session' }` en el `createClient`
- [x] 1.2 En `supabaseClient.ts` (DBStats), añadir `auth: { storageKey: 'sb-dbstats-session' }` en el `createClient`
- [ ] 1.3 Verificar en la consola del navegador que cada app usa su propia clave en `localStorage` (abrir DevTools → Application → Local Storage)

## 2. Corrección del listener onAuthStateChange en AdminAuthGate

- [x] 2.1 En `src/components/AdminAuthGate.tsx`, actualizar el listener `onAuthStateChange` para que solo llame a `resolveAdminAuthorization()` en los eventos `SIGNED_IN` e `INITIAL_SESSION`
- [x] 2.2 Para el evento `SIGNED_OUT` (y `USER_DELETED` si aplica), limpiar `email`, `isAuthorized` a `false` e `isLoading` a `false` directamente, sin llamar al RPC
- [x] 2.3 Para el evento `TOKEN_REFRESHED`, actualizar solo `email` con el email de la sesión renovada pero sin cambiar `isAuthorized`
- [x] 2.4 (CORRECCIÓN - Causa Raíz) En `src/components/AdminAuthGate.tsx`, agregar filtro explícito: después de checks TOKEN_REFRESHED y SIGNED_OUT, insertar `if (_event !== 'SIGNED_IN' && _event !== 'INITIAL_SESSION') { return; }` para ignorar otros eventos raros de Supabase
- [x] 2.4b Agregar logging para eventos ignorados: `authTrace('gate:auth-event-ignored', { event: _event, reason: 'not-sign-in-or-initial' })`

## 3. Ajuste del timeout y comportamiento ante latencia

- [x] 3.1 Aumentar la constante `ADMIN_CHECK_TIMEOUT_MS` de `8000` a `15000` en `AdminAuthGate.tsx`
- [x] 3.2 En el catch de `resolveAdminAuthorization`, cuando el error es `'admin-check-timeout'` y hay un `email` de sesión activo, dejar `isAuthorized` en `null` (estado de carga) en lugar de establecerlo a `false`
- [x] 3.3 Añadir un botón de "Reintentar" en la pantalla de error de timeout que vuelva a llamar a `resolveAdminAuthorization()` y actualice el estado

## 4. Verificación manual end-to-end

- [ ] 4.1 Desplegar la build de 3x3 y comprobar que un admin puede permanecer logado más de 1 hora sin ser expulsado (o simular el evento `TOKEN_REFRESHED` desde DevTools Supabase / debug)
- [ ] 4.2 Abrir 3x3 y DBStats en el mismo navegador y verificar que las acciones de auth en una app no afectan a la otra (comprobar que las claves `localStorage` son distintas)
- [ ] 4.3 Hacer logout en 3x3 y confirmar que DBStats sigue cargando datos correctamente sin necesidad de borrar caché
