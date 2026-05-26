## ADDED Requirements

### Requirement: Almacenamiento de sesión aislado por app
Cada instancia del cliente Supabase SHALL usar una clave `storageKey` única en `localStorage` para que el estado de autenticación de 3x3 Hub y DBStats no interfieran entre sí, incluso cuando comparten el mismo origen y el mismo proyecto Supabase.

#### Scenario: 3x3 admin inicia sesión, DBStats no ve cambio
- **WHEN** un admin inicia sesión con Google en 3x3 Hub
- **THEN** DBStats NO lee ni modifica el token de sesión de 3x3 en `localStorage`

#### Scenario: Admin cierra sesión en 3x3, DBStats sigue cargando datos
- **WHEN** el admin hace logout en 3x3 Hub
- **THEN** DBStats sigue realizando peticiones anónimas a Supabase sin errores de autenticación

#### Scenario: DBStats abre con token antiguo de 3x3 en localStorage
- **WHEN** el usuario tenía una sesión de 3x3 guardada bajo la clave antigua (`sb-{projectRef}-auth-token`) y carga DBStats con la nueva versión
- **THEN** DBStats carga datos correctamente usando su propia clave de sesión aislada

### Requirement: Re-validación de admin solo en eventos de inicio de sesión
El componente `AdminAuthGate` SHALL llamar al RPC `is_admin()` únicamente ante los eventos de Supabase `SIGNED_IN` e `INITIAL_SESSION`. Los eventos `TOKEN_REFRESHED`, `MFA_CHALLENGE_VERIFIED` y otros que no cambien la identidad del usuario NO SHALL desencadenar una nueva comprobación de permisos.

#### Scenario: Refresco automático de token no interrumpe la sesión admin
- **WHEN** Supabase refresca automáticamente el JWT (evento `TOKEN_REFRESHED`)
- **THEN** `AdminAuthGate` mantiene el estado `isAuthorized` actual sin llamar al RPC `is_admin()`
- **THEN** el usuario admin NO ve ninguna pantalla de carga ni de "sin acceso"

#### Scenario: Inicio de sesión completo valida admin
- **WHEN** Supabase emite evento `SIGNED_IN` (tras OAuth exitoso)
- **THEN** `AdminAuthGate` llama a `is_admin()` y actualiza `isAuthorized` en consecuencia

#### Scenario: Cierre de sesión limpia el estado inmediatamente
- **WHEN** Supabase emite evento `SIGNED_OUT`
- **THEN** `AdminAuthGate` establece `isAuthorized` a `false` y `email` a `null` sin llamar al RPC

### Requirement: Timeout de comprobación admin con umbral aumentado
El helper `withTimeout` SHALL usar un umbral de 15 000 ms para el RPC `is_admin()`. Un timeout no SHALL resultar en `isAuthorized = false` si el usuario ya tiene un email de sesión activo; SHALL mostrar un mensaje de error recuperable que permita reintentar.

#### Scenario: RPC lento en cold-start no expulsa al admin
- **WHEN** el RPC `is_admin()` tarda más de 8 000 ms pero menos de 15 000 ms
- **THEN** el admin NO es marcado como no autorizado

#### Scenario: RPC con timeout absoluto muestra error de reintento
- **WHEN** el RPC `is_admin()` supera los 15 000 ms
- **THEN** se muestra un mensaje de error indicando que no se pudieron validar los permisos y se ofrece un botón de reintento
- **THEN** `isAuthorized` permanece en `null` (estado de carga) hasta que el usuario reintente o cierre sesión
