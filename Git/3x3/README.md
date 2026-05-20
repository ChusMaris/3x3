# 3x3 Hub

Aplicación para gestión de torneos 3x3 con dos zonas separadas:

- Portal público: consulta de torneos activos, calendario, clasificación y resultados.
- Panel admin: creación y edición de torneos con acceso restringido.

## Rutas

La app usa HashRouter (compatible con despliegue estático en GitHub Pages):

- Público: `/#/live`
- Público directo por torneo: `/#/live/:tournamentId`
- Admin: `/#/admin`

## Variables de entorno

Crea un archivo `.env.local` con:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

## Seguridad recomendada (Supabase)

1. Activa Google OAuth en Supabase Auth.
2. Añade en Auth > URL Configuration la URL de redirección de tu app (`.../#/admin`).
3. Ejecuta el SQL de `supabase_setup.sql`.
4. Inserta tus correos admin en `public.admin_users`.

Con esta configuración:

- Público solo puede leer torneos activos (`event_date >= current_date`).
- Solo admins autenticados pueden crear, editar o borrar torneos.

## Desarrollo

```bash
npm install
npm run dev
```

## Build y deploy

```bash
npm run build
npm run deploy
```

## QR para jugadores

- QR general (selección de torneo activo): apunta a `/#/live`.
- QR directo a portal público (misma pantalla): `/#/live`.

Si más adelante quieres QR por torneo, se puede añadir ruta con id (`/#/live/:id`).
