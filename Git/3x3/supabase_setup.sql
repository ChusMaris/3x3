-- Script base para 3x3 Hub con separación pública/admin
-- Ejecuta este SQL en Supabase SQL Editor.

-- 1) Tabla principal de torneos
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_event_date ON public.tournaments(event_date);

-- 2) Tabla de lista blanca de admins
CREATE TABLE IF NOT EXISTS public.admin_users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserta aquí los correos autorizados (minúsculas recomendado)
-- INSERT INTO public.admin_users (email) VALUES
-- ('admin1@tu-dominio.com'),
-- ('admin2@tu-dominio.com')
-- ON CONFLICT DO NOTHING;

-- 3) Función helper para saber si el usuario autenticado es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE lower(au.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 4) Activar RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 5) Limpiar políticas antiguas para evitar conflictos
DROP POLICY IF EXISTS "Permitir lectura anónima" ON public.tournaments;
DROP POLICY IF EXISTS "Permitir inserción anónima" ON public.tournaments;
DROP POLICY IF EXISTS "Permitir actualización anónima" ON public.tournaments;
DROP POLICY IF EXISTS "Permitir borrado anónimo" ON public.tournaments;
DROP POLICY IF EXISTS "Public can read active tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can insert tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can delete tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;

-- 6) Políticas de torneos
-- Público: solo lectura de torneos activos (hoy o futuros)
CREATE POLICY "Public can read active tournaments"
ON public.tournaments
FOR SELECT
USING (
  event_date >= current_date OR public.is_admin()
);

-- Admin autenticado: puede crear/editar/borrar
CREATE POLICY "Admins can insert tournaments"
ON public.tournaments
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update tournaments"
ON public.tournaments
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete tournaments"
ON public.tournaments
FOR DELETE
USING (public.is_admin());

-- 7) Políticas de admin_users (solo admins)
CREATE POLICY "Admins can manage admin_users"
ON public.admin_users
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
