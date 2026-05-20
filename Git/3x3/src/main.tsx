import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.tsx';
import { AdminAuthGate } from './components/AdminAuthGate';
import { PublicLivePage } from './components/PublicLivePage';
import './index.css';

const authTrace = (step: string, payload?: Record<string, unknown>) => {
  console.info('[AUTH-TRACE]', step, payload || {});
};

const restoreSupabaseOAuthRoute = () => {
  if (typeof window === 'undefined') return;

  const hash = window.location.hash;
  const search = window.location.search;
  const searchParams = new URLSearchParams(search);
  const hashRouteMatch = hash.match(/^#(\/[^?#&]*)([?#].*|#.*)?$/);
  const hashRoute = hashRouteMatch?.[1] || '';
  const hashSuffix = hashRouteMatch?.[2] || '';
  const hashParams = new URLSearchParams(hashSuffix.replace(/^[?#]/, ''));
  const oauthInSearch = searchParams.has('code') || searchParams.has('error') || searchParams.has('error_description');
  const oauthInHash =
    hash.includes('access_token=') ||
    hash.includes('refresh_token=') ||
    hash.includes('error=') ||
    hash.includes('supabase_route=') ||
    hashParams.has('code') ||
    hashParams.has('error') ||
    hashParams.has('error_description');

  const storedRoute = sessionStorage.getItem('supabase_oauth_route') || localStorage.getItem('supabase_oauth_route');
  const routeFromHash = hashParams.get('supabase_route');
  const route = storedRoute || routeFromHash || (oauthInSearch || oauthInHash ? '/admin' : '');
  const oauthStartRaw = localStorage.getItem('supabase_admin_oauth_started_at');
  const oauthStartAt = oauthStartRaw ? Number(oauthStartRaw) : 0;
  const oauthRecentlyStarted = Number.isFinite(oauthStartAt) && oauthStartAt > 0 && Date.now() - oauthStartAt < 10 * 60 * 1000;

  authTrace('restore:start', {
    hash,
    search,
    hashRoute,
    hashSuffix,
    oauthInSearch,
    oauthInHash,
    storedRoute,
    routeFromHash,
    route,
    oauthRecentlyStarted,
  });

  const clearStoredRoute = () => {
    sessionStorage.removeItem('supabase_oauth_route');
    localStorage.removeItem('supabase_oauth_route');
    localStorage.removeItem('supabase_admin_oauth_started_at');
  };

  if (storedRoute && oauthRecentlyStarted) {
    const restoreOnHashClear = () => {
      if (!window.location.hash) {
        authTrace('restore:hashchange-empty-restore-route', { target: `#${storedRoute}` });
        window.location.hash = storedRoute;
        clearStoredRoute();
        window.removeEventListener('hashchange', restoreOnHashClear);
      }
    };
    window.addEventListener('hashchange', restoreOnHashClear);
  }

  if (!route) return;

  if (!hash && route && oauthRecentlyStarted) {
    authTrace('restore:empty-hash-restore-route', { target: `#${route}` });
    window.location.hash = `#${route}`;
    clearStoredRoute();
    return;
  }

  if (hash === `#${route}` || hash.startsWith(`#${route}?`) || hash.startsWith(`#${route}#`) || hash.startsWith(`#${route}&`)) {
    authTrace('restore:already-on-route', { route });
    clearStoredRoute();
    return;
  }

  // Some Supabase setups land on #/live after OAuth callback. Force it back to the intended route.
  if (hashRoute === '/live' && (storedRoute || oauthInSearch || oauthInHash)) {
    authTrace('restore:live-to-route', { target: `#${route}${hashSuffix}` });
    window.location.hash = `#${route}${hashSuffix}`;
    return;
  }

  if (hashRoute === '/live' && oauthRecentlyStarted) {
    authTrace('restore:live-fallback-admin', { target: '#/admin' });
    window.location.hash = '#/admin';
    clearStoredRoute();
    return;
  }

  // Some callbacks return a token-only hash (e.g. #access_token=...)
  // with no HashRouter route, which would otherwise hit "*" and redirect to /live.
  // Keep auth params in the hash so Supabase can still consume them before we clean the URL.
  if (!hashRoute && oauthInHash && route) {
    const authFragment = hash.replace(/^#/, '');
    authTrace('restore:token-hash-to-route', { target: `#${route}?${authFragment}` });
    window.location.hash = `#${route}?${authFragment}`;
    return;
  }

  // PKCE callback from Supabase often returns ?code=... without a hash route.
  // Preserve the auth query string, but force HashRouter back to the admin path.
  if (!hash && (searchParams.has('code') || searchParams.has('error') || searchParams.has('error_description'))) {
    authTrace('restore:pkce-query-to-admin', { target: '/admin' });
    window.location.hash = '/admin';
    clearStoredRoute();
  }
};

restoreSupabaseOAuthRoute();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/live" element={<PublicLivePage />} />
        <Route path="/live/:tournamentId" element={<PublicLivePage />} />
        <Route
          path="/admin"
          element={(
            <AdminAuthGate>
              <App />
            </AdminAuthGate>
          )}
        />
        <Route path="*" element={<Navigate to="/live" replace />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
