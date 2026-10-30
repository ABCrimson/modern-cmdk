// Ambient declarations for web APIs that TypeScript's bundled lib files still lack.
// Array.fromAsync (lib.es2026.array) and the Scheduler / globalThis.scheduler pair
// (lib.dom) now ship in TypeScript 7.1's lib; only Navigator.scheduling.isInputPending
// (the Chromium-only isInputPending() API) is missing from lib.dom.

interface SchedulingIsInputPending {
  isInputPending?(): boolean;
}

interface Navigator {
  scheduling?: SchedulingIsInputPending;
}
