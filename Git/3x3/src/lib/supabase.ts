import { createClient } from '@supabase/supabase-js';

const authTrace = (step: string, payload?: Record<string, unknown>) => {
  console.info('[AUTH-TRACE]', step, payload || {});
};

const normalizeSupabaseOAuthHash = () => {
  if (typeof window === 'undefined') return;
  const { hash } = window.location;
  authTrace('normalize:start', { hash, search: window.location.search });
  if (!hash.startsWith('#')) return;

  const authKeys = ['access_token', 'refresh_token', 'expires_in', 'error_description', 'error'];
  if (!authKeys.some((key) => hash.includes(`${key}=`))) return;

  const routeMatch = hash.match(/^#(\/[^?#&]*)([?#&].*|#.*)$/);
  const path = routeMatch?.[1];
  const authFragment = routeMatch?.[2]?.replace(/^([?#&])/, '') || hash.slice(1);

  if (!authFragment.includes('access_token') && !authFragment.includes('refresh_token') && !authFragment.includes('error_description') && !authFragment.includes('error')) {
    authTrace('normalize:no-auth-fragment', { hash });
    return;
  }

  const authParams = new URLSearchParams(authFragment);
  const route = path || authParams.get('supabase_route') || '/admin';
  if (!authParams.get('supabase_route')) {
    authParams.set('supabase_route', route);
  }

  const normalizedHash = `#${authParams.toString()}`;
  if (normalizedHash === hash) {
    authTrace('normalize:already-normalized', { normalizedHash });
    return;
  }

  sessionStorage.setItem('supabase_oauth_route', route);
  authTrace('normalize:rewrite-to-token-only', { route, normalizedHash });
  window.location.hash = normalizedHash;
};

normalizeSupabaseOAuthHash();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);

export const isAdmin = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('is_admin');
    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    console.error('Error calling is_admin RPC:', error);
    return false;
  }
};

export const signInAdminWithGoogle = async () => {
  const redirectTo = `${window.location.origin}${window.location.pathname}#/admin`;
  sessionStorage.setItem('supabase_oauth_route', '/admin');
  localStorage.setItem('supabase_oauth_route', '/admin');
  localStorage.setItem('supabase_admin_oauth_started_at', Date.now().toString());
  authTrace('signin:start', {
    redirectTo,
    hash: window.location.hash,
    search: window.location.search,
    sessionRoute: sessionStorage.getItem('supabase_oauth_route'),
    localRoute: localStorage.getItem('supabase_oauth_route'),
  });
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
};

export const signOutAdmin = async () => {
  return supabase.auth.signOut();
};

