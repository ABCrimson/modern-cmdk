// Ambient type for bundler-injected process.env.NODE_ENV
// Replaced at build time by Vite/tsdown/Rolldown — never runs at runtime
declare const process: { readonly env: { readonly NODE_ENV: string } };
