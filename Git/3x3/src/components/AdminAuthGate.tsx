import { ReactNode, useEffect, useState } from 'react';
import { Loader2, LockKeyhole, LogOut, ShieldAlert } from 'lucide-react';
import {
  isSupabaseConfigured,
  isAdmin,
  signInAdminWithGoogle,
  signOutAdmin,
  supabase,
} from '../lib/supabase';

const authTrace = (step: string, payload?: Record<string, unknown>) => {
  console.info('[AUTH-TRACE]', step, payload || {});
};

// En modo desarrollo saltamos Supabase para poder probar la UI localmente
const DEV_BYPASS = import.meta.env.DEV;

const ADMIN_CHECK_TIMEOUT_MS = 8000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('admin-check-timeout')), timeoutMs);
    }),
  ]);
};

const GoogleMark = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.192 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.054 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-0.138-2.65-0.389-3.917z"/>
    <path fill="#FF3D00" d="M6.307 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.054 29.268 4 24 4c-7.682 0-14.287 4.337-17.693 10.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.191l-6.19-5.238C29.144 35.091 26.692 36 24 36c-5.171 0-9.627-3.323-11.287-7.946l-6.522 5.025C9.557 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-0.792 2.237-2.231 4.166-4.084 5.571c0.001-0.001 6.19 5.238 6.19 5.238C36.971 39.206 44 34 44 24c0-1.341-0.138-2.65-0.389-3.917z"/>
  </svg>
);

interface AdminAuthGateProps {
  children: ReactNode;
}

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const resolveAdminAuthorization = async () => {
    try {
      return await withTimeout(isAdmin(), ADMIN_CHECK_TIMEOUT_MS);
    } catch (err) {
      authTrace('gate:is-admin-timeout-or-error', {
        message: err instanceof Error ? err.message : String(err),
      });
      setError('No se pudo validar los permisos de admin a tiempo. Reintenta en unos segundos.');
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;
    authTrace('gate:mount', {
      hash: window.location.hash,
      search: window.location.search,
      configured: isSupabaseConfigured,
    });

    const boot = async () => {
      try {
        if (!isSupabaseConfigured) {
          if (mounted) setIsAuthorized(false);
          return;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;

        authTrace('gate:session', {
          sessionEmail: data.session?.user?.email || null,
          hasSession: Boolean(data.session),
          sessionError: sessionError?.message || null,
          hash: window.location.hash,
          search: window.location.search,
        });

        if (sessionError) {
          setError('No se pudo comprobar la sesión de administrador.');
        }

        const sessionEmail = data.session?.user?.email || null;
        setEmail(sessionEmail);

        if (sessionEmail) {
          const authorized = await resolveAdminAuthorization();
          if (!mounted) return;
          setIsAuthorized(authorized);
        } else {
          setIsAuthorized(false);
        }
      } catch (err) {
        authTrace('gate:boot-error', { message: err instanceof Error ? err.message : String(err) });
        if (mounted) {
          setError('Se produjo un error comprobando la sesión admin.');
          setEmail(null);
          setIsAuthorized(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    boot();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      authTrace('gate:auth-state-change', {
        event: _event,
        email: session?.user?.email || null,
        hasSession: Boolean(session),
        hash: window.location.hash,
        search: window.location.search,
      });
      if (!mounted) return;

      setEmail(session?.user?.email || null);
      try {
        if (session?.user?.email) {
          const authorized = await resolveAdminAuthorization();
          if (!mounted) return;
          setIsAuthorized(authorized);
        } else {
          setIsAuthorized(false);
        }
      } catch (err) {
        authTrace('gate:listener-error', { message: err instanceof Error ? err.message : String(err) });
        if (mounted) setIsAuthorized(false);
      } finally {
        if (mounted) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    authTrace('gate:authorization', { email, isAuthorized });
  }, [email, isAuthorized]);

  useEffect(() => {
    if (!email) return;
    const hash = window.location.hash;
    const hasOAuthParams =
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      hash.includes('expires_in=') ||
      hash.includes('provider_token=') ||
      hash.includes('supabase_route=');

    if (!hasOAuthParams) return;

    authTrace('gate:cleanup-auth-hash', { hash });
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/admin`);
    sessionStorage.removeItem('supabase_oauth_route');
    localStorage.removeItem('supabase_oauth_route');
    localStorage.removeItem('supabase_admin_oauth_started_at');
  }, [email]);

  // Bypass completo en modo desarrollo — no pasa por Supabase
  if (DEV_BYPASS) {
    return <>{children}</>;
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center px-6">
        <div className="max-w-xl w-full bg-[#111827] border border-white/10 rounded-3xl p-8 space-y-4">
          <div className="flex items-center gap-2 text-amber-300">
            <ShieldAlert className="w-5 h-5" />
            <p className="font-black uppercase text-xs tracking-[0.25em]">Admin no disponible</p>
          </div>
          <h1 className="text-2xl font-black italic">Configura Supabase para acceder al panel de administración</h1>
          <p className="text-sm text-slate-300">
            Faltan variables de entorno para autenticación. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-[#22d3ee]" />
          <p className="text-xs uppercase tracking-[0.25em] font-black">Comprobando sesión admin</p>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-[#111827] border border-white/10 rounded-3xl p-8 space-y-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="w-12 h-12 rounded-2xl bg-cyan-300/15 border border-cyan-200/20 flex items-center justify-center">
            <LockKeyhole className="w-6 h-6 text-[#22d3ee]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-black">Zona Admin</p>
            <h1 className="text-2xl font-black italic mt-2">Acceso restringido</h1>
            <p className="text-sm text-slate-400 mt-2">Usa tu cuenta corporativa de Google para entrar de forma segura.</p>
          </div>
          <p className="text-sm text-slate-300">
            Accede con Google para entrar al panel de gestión. Solo los administradores registrados en la tabla <code>admin_users</code> podrán continuar.
          </p>
          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl p-3">{error}</p>
          )}
          <button
            type="button"
            disabled={isSigningIn}
            onClick={async () => {
              setIsSigningIn(true);
              setError(null);
              authTrace('gate:login-click', {
                hash: window.location.hash,
                search: window.location.search,
              });
              const { error: loginError } = await signInAdminWithGoogle();
              if (loginError) {
                authTrace('gate:login-error', { message: loginError.message });
                setError('No se pudo iniciar sesión con Google.');
                setIsSigningIn(false);
              }
            }}
            className="w-full h-12 inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-all hover:bg-slate-50 hover:shadow-[0_3px_12px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <GoogleMark />
            <span>{isSigningIn ? 'Conectando con Google...' : 'Continuar con Google'}</span>
          </button>
          <p className="text-xs text-slate-500">Google abrirá una ventana segura de autenticación y te devolverá automáticamente al panel.</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-[#111827] border border-red-400/30 rounded-3xl p-8 space-y-5">
          <div className="flex items-center gap-2 text-red-300">
            <ShieldAlert className="w-5 h-5" />
            <p className="text-[10px] uppercase tracking-[0.25em] font-black">Sin permisos</p>
          </div>
          <h1 className="text-2xl font-black italic">Este usuario no está autorizado</h1>
          <p className="text-sm text-slate-300">Tu cuenta ({email}) no figura en la lista de administradores permitidos de Supabase.</p>
          <button
            onClick={async () => {
              await signOutAdmin();
            }}
            className="inline-flex items-center gap-2 bg-slate-800 border border-white/10 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.2em] hover:bg-slate-700 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
