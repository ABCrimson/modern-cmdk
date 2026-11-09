// apps/playground/src/theme.ts
// The playground theme lives in one place: the `data-theme` attribute on <html>. The CSS keys off
// it, `applyInitialTheme` sets it once before the first render, `readTheme` reads it back, and
// `setTheme` writes it and remembers the choice in localStorage.

export type Theme = 'dark' | 'light';

/** localStorage key holding the chosen theme (`dark` or `light`). */
const STORAGE_KEY = 'playground-theme';

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** The stored choice, or undefined when none is valid or storage is unavailable. */
function readStoredTheme(): Theme | undefined {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : undefined;
  } catch {
    // Storage access can throw (SecurityError); the OS preference then decides.
    return undefined;
  }
}

/**
 * Sets the initial theme, unless the attribute is already set: a valid stored choice wins, else
 * the OS colour scheme decides.
 * This must run before the first render, so ThemeToggle (which initialises from the attribute) and
 * the page always agree. A classic inline script in index.html would run earlier, but Vite dev
 * injects the CSS from JS anyway, and keeping it here keeps it typed and next to the code that
 * reads it.
 */
export function applyInitialTheme(): void {
  if (document.documentElement.dataset.theme === undefined) {
    document.documentElement.dataset.theme =
      readStoredTheme() ??
      (globalThis.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
}

/**
 * Applies `theme` to `<html data-theme>` and stores it. A storage failure (SecurityError,
 * QuotaExceededError) is swallowed: the theme still applies for this page, it just is not kept.
 */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not persisted; the choice holds until reload.
  }
}

/**
 * Reads the current theme from `<html data-theme>`. The attribute is set by
 * `applyInitialTheme` before render, so any other value is a programming error and throws.
 */
export function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  if (isTheme(value)) return value;
  throw new Error(
    `Invalid <html data-theme> ${value === undefined ? '(unset)' : JSON.stringify(value)}: expected "dark" or "light". Call applyInitialTheme() before rendering.`,
  );
}
