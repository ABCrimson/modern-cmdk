// Exact pins for the dependencies of a scaffolded app, the npm `latest` dist-tag of each package
// (pnpm view <pkg> dist-tags --json) on 2026-11-11. A consumer app never pins the workspace
// catalog's experimental React or a TypeScript dev build; the hold is recorded in
// .peak-modern-holds.json. modern-cmdk's own version is not here: tsdown.config.ts injects it
// at build time (MODERN_CMDK_VERSION). Re-resolve at every release candidate.
export const DEPENDENCIES = {
  'radix-ui': '1.8.1',
  react: '19.3.1',
  'react-dom': '19.3.1',
} as const;

export const DEV_DEPENDENCIES = {
  '@types/node': '26.6.6',
  '@types/react': '19.3.0',
  '@types/react-dom': '19.3.0',
  '@vitejs/plugin-react': '6.3.0',
  typescript: '7.0.2',
  vite: '8.3.8',
} as const;

/**
 * The modern-cmdk version this build scaffolds, or undefined outside a build. tsdown.config.ts
 * injects it as a literal; Vitest tests stub it. It is read per call, and here rather than in
 * index.ts because Vite's SSR transform puts its env assignment ahead of that
 * file's `#!` line.
 */
export function modernCmdkVersion(): string | undefined {
  return import.meta.env.MODERN_CMDK_VERSION;
}
