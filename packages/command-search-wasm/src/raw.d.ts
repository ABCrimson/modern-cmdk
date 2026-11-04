// Vite `?raw` imports (used by worker-engine.test.ts to read source text); no Node types needed.
declare module '*?raw' {
  const source: string;
  export default source;
}
