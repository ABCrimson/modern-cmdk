// Vite (Vitest) and the 'raw-query' plugin of tsdown.config.ts both resolve `?raw` to the file's text.
declare module '*?raw' {
  const text: string;
  export default text;
}
