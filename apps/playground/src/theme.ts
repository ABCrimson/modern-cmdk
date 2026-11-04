// apps/playground/src/theme.ts
// The playground theme lives in one place: the `data-theme` attribute on <html>. The CSS keys off
// it, `applyOsThemeDefault` sets it once before the first render, and `readTheme` reads it back.

export type Theme = 'dark' | 'light';

/**
 * Sets the initial theme from the OS colour scheme, unless the attribute is already set.
 * This must run before the first render, so ThemeToggle (which initialises from the attribute) and
 * the page always agree. A classic inline script in index.html would run earlier, but Vite dev
 * injects the CSS from JS anyway, and keeping it here keeps it typed and next to the code that
 * reads it.
 */
export function applyOsThemeDefault(): void {
  if (document.documentElement.dataset.theme === undefined) {
    document.documentElement.dataset.theme = globalThis.matchMedia('(prefers-color-scheme: light)')
      .matches
      ? 'light'
      : 'dark';
  }
}

/**
 * Reads the current theme from `<html data-theme>`. The attribute is set by
 * `applyOsThemeDefault` before render, so any other value is a programming error and throws.
 */
export function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  if (value === 'dark' || value === 'light') return value;
  throw new Error(
    `Invalid <html data-theme> ${value === undefined ? '(unset)' : JSON.stringify(value)}: expected "dark" or "light". Call applyOsThemeDefault() before rendering.`,
  );
}
