'use client';

// apps/playground/src/App.tsx
// Main app with pathname-based routing for demos
// React 19: useTransition, useId, ref as prop
// ES2026: Iterator Helpers

import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import { AllStatesDemo } from './demos/AllStatesDemo.js';
import { BasicDemo } from './demos/BasicDemo.js';
import { DarkModeDemo } from './demos/DarkModeDemo.js';
import { DialogDemo } from './demos/DialogDemo.js';
import { ErrorBoundaryDemo } from './demos/ErrorBoundaryDemo.js';
import { HighContrastDemo } from './demos/HighContrastDemo.js';
import { RTLDemo } from './demos/RTLDemo.js';
import { VirtualizedDemo } from './demos/VirtualizedDemo.js';

type Route =
  | '/'
  | '/dialog'
  | '/virtualization'
  | '/all-states'
  | '/rtl'
  | '/error-boundary'
  | '/dark-mode'
  | '/high-contrast';

const ROUTES: readonly { path: Route; label: string; badge?: string }[] = [
  { path: '/', label: 'Basic' },
  { path: '/dialog', label: 'Dialog' },
  { path: '/virtualization', label: 'Virtualized', badge: '10K' },
  { path: '/all-states', label: 'All States' },
  { path: '/rtl', label: 'RTL' },
  { path: '/error-boundary', label: 'Error Boundary' },
  { path: '/dark-mode', label: 'Dark Mode' },
  { path: '/high-contrast', label: 'High Contrast' },
] as const;

function getRouteFromPathname(): Route {
  const pathname = globalThis.location?.pathname ?? '/';
  // ES2026: Iterator Helpers — .some() on iterator
  const isValid = ROUTES.values().some((r) => r.path === pathname);
  return isValid ? (pathname as Route) : '/';
}

function ThemeToggle(): React.ReactNode {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark';
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '\u2600' : '\u263E'}
    </button>
  );
}

export function App(): React.ReactNode {
  const [route, setRoute] = useState<Route>(getRouteFromPathname);
  const [isPending, startTransition] = useTransition();
  const navId = useId();

  // Listen for popstate (back/forward navigation)
  useEffect(() => {
    const handlePopState = (): void => {
      startTransition(() => {
        setRoute(getRouteFromPathname());
      });
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: Route) => {
    globalThis.history.pushState(null, '', path);
    startTransition(() => {
      setRoute(path);
    });
  }, []);

  // ES2026: Iterator Helpers — .map().toArray() on readonly array iterator
  const navItems = ROUTES.values()
    .map((r) => (
      <button
        key={r.path}
        type="button"
        className={`nav-tab${route === r.path ? ' nav-tab--active' : ''}`}
        onClick={() => navigate(r.path)}
        aria-current={route === r.path ? 'page' : undefined}
        aria-controls="demo-panel"
      >
        {r.label}
        {r.badge != null && <span className="demo-badge demo-badge--beta">{r.badge}</span>}
      </button>
    ))
    .toArray();

  return (
    <div className="playground">
      <header className="playground-header">
        <div className="playground-brand">
          <div className="playground-logo" aria-hidden="true">
            C
          </div>
          <h1 className="playground-title">@crimson_dev/command</h1>
        </div>
        <p className="playground-subtitle">
          The definitive command palette engine for the modern web.
        </p>
        <div className="playground-meta">
          <span className="playground-version">v0.9.0-rc</span>
          <span className="playground-version">React 19</span>
          <span className="playground-version">ES2026</span>
          <ThemeToggle />
        </div>
        <nav className="playground-nav" aria-label="Demo navigation" id={navId}>
          {navItems}
        </nav>
      </header>

      <main
        className="playground-main"
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={navId}
        aria-busy={isPending}
        style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 150ms ease' }}
      >
        {route === '/' && <BasicDemo />}
        {route === '/dialog' && <DialogDemo />}
        {route === '/virtualization' && <VirtualizedDemo />}
        {route === '/all-states' && <AllStatesDemo />}
        {route === '/rtl' && <RTLDemo />}
        {route === '/error-boundary' && <ErrorBoundaryDemo />}
        {route === '/dark-mode' && <DarkModeDemo />}
        {route === '/high-contrast' && <HighContrastDemo />}
      </main>

      <footer className="playground-footer">
        <span className="footer-text">Built with React 19, TypeScript 6, Vite 8, ES2026</span>
        <div className="footer-links">
          <a href="https://command.crimson.dev" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
          <a
            href="https://github.com/ABCrimson/modern-cmdk"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@crimson_dev/command"
            target="_blank"
            rel="noopener noreferrer"
          >
            npm
          </a>
        </div>
      </footer>
    </div>
  );
}
