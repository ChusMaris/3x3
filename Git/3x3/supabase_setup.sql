-- Script para crear la tabla de torneos en Supabase
-- Copia este código y ejecútalo en el SQL Editor de Supabase

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Crear un índice por fecha para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_tournaments_event_date ON tournaments(event_date);

-- 3. Configurar Row Level Security (RLS)
-- Por defecto, Supabase bloquea el acceso. 
-- Estas políticas permiten lectura y escritura completa para cualquier persona con la anon key.
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura anónima" 
ON tournaments FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserción anónima" 
ON tournaments FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir actualización anónima" 
ON tournaments FOR UPDATE 
USING (true);

CREATE POLICY "Permitir borrado anónimo" 
ON tournaments FOR DELETE 
USING (true);
