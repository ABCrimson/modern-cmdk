// Set at build time by tsdown.config.ts (env), read from packages/modern-cmdk/package.json;
// Vitest tests stub it with vi.stubEnv. Undefined when neither ran, and run() then throws.
interface ImportMetaEnv {
  readonly MODERN_CMDK_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
