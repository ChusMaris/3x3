import { createClient } from '@supabase/supabase-js';

// Puedes poner tus valores aquí directamente para probar rápido
// IMPORTANTE: Si subes esto a GitHub, tus llaves serán públicas.
const HARDCODED_URL = 'https://zvojniiaftqwdaggfvma.supabase.co'; // Ej: 'https://xyz.supabase.co'
const HARDCODED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b2puaWlhZnRxd2RhZ2dmdm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTE0MDYsImV4cCI6MjA4MzYyNzQwNn0.9Xht9Z_Bmfp05U6G-_JrETIqsE87RFd-JXQMpaHrmzM'; // Ej: 'eyJhbGciOiJIUzI1NiIsInR5...'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || HARDCODED_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || HARDCODED_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

