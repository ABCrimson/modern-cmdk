'use client';

// apps/playground/src/App.tsx
// Main app with pathname-based routing for demos
// Vite dev server is configured with SPA fallback so /dialog etc. serve index.html

import { useCallback, useEffect, useState } from 'react';
import { BasicDemo } from './demos/BasicDemo.js';
import { DialogDemo } from './demos/DialogDemo.js';
import { VirtualizedDemo } from './demos/VirtualizedDemo.js';
import { AllStatesDemo } from './demos/AllStatesDemo.js';
import { RTLDemo } from './demos/RTLDemo.js';
import { ErrorBoundaryDemo } from './demos/ErrorBoundaryDemo.js';
import { DarkModeDemo } from './demos/DarkModeDemo.js';
import { HighContrastDemo } from './demos/HighContrastDemo.js';

type Route = '/' | '/dialog' | '/virtualization' | '/all-states' | '/rtl' | '/error-boundary' | '/dark-mode' | '/high-contrast';

const ROUTES: readonly { path: Route; label: string }[] = [
  { path: '/', label: 'Basic' },
  { path: '/dialog', label: 'Dialog' },
  { path: '/virtualization', label: 'Virtualized (10K)' },
  { path: '/all-states', label: 'All States' },
  { path: '/rtl', label: 'RTL' },
  { path: '/error-boundary', label: 'Error Boundary' },
  { path: '/dark-mode', label: 'Dark Mode' },
  { path: '/high-contrast', label: 'High Contrast' },
] as const;

function getRouteFromPathname(): Route {
  const pathname = globalThis.location?.pathname ?? '/';
  const valid: readonly string[] = ROUTES.map((r) => r.path);
  return valid.includes(pathname) ? (pathname as Route) : '/';
}

export function App(): React.ReactNode {
  const [route, setRoute] = useState<Route>(getRouteFromPathname);

  // Listen for popstate (back/forward navigation)
  const handlePopState = useCallback(() => {
    setRoute(getRouteFromPathname());
  }, []);

  useEffect(() => {
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [handlePopState]);

  const navigate = useCallback((path: Route) => {
    globalThis.history.pushState(null, '', path);
    setRoute(path);
  }, []);

  // Use Iterator Helpers (ES2026) to build nav items
  const navItems = ROUTES.values()
    .map((r) => (
      <button
        key={r.path}
        type="button"
        className={`nav-tab${route === r.path ? ' nav-tab--active' : ''}`}
        onClick={() => navigate(r.path)}
      >
        {r.label}
      </button>
    ))
    .toArray();

  return (
    <div className="playground">
      <header className="playground-header">
        <h1 className="playground-title">@crimson_dev/command</h1>
        <nav className="playground-nav">{navItems}</nav>
      </header>

      <main className="playground-main">
        {route === '/' && <BasicDemo />}
        {route === '/dialog' && <DialogDemo />}
        {route === '/virtualization' && <VirtualizedDemo />}
        {route === '/all-states' && <AllStatesDemo />}
        {route === '/rtl' && <RTLDemo />}
        {route === '/error-boundary' && <ErrorBoundaryDemo />}
        {route === '/dark-mode' && <DarkModeDemo />}
        {route === '/high-contrast' && <HighContrastDemo />}
      </main>
    </div>
  );
}
