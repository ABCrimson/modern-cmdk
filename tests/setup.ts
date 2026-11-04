// tests/setup.ts
// Vitest 5 setup file — fake-indexeddb, the act() environment, and the one ES2026 polyfill
// the supported runtimes still lack (Math.sumPrecise: absent on the Node 26 floor, native on Node 27+).

import 'fake-indexeddb/auto';

declare global {
  // React reads this flag off globalThis to decide whether act() warnings apply.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// React act() environment — suppresses "not configured to support act()" warnings.
// The tests drive react-dom/client + act() directly (no @testing-library/react), so
// nothing else sets this flag.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill Math.sumPrecise where the runtime lacks it (Node 26 floor)
if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = function sumPrecise(values: Iterable<number>): number {
    // Kahan compensated summation for high precision
    let sum = 0;
    let compensation = 0;
    for (const value of values) {
      const y = value - compensation;
      const t = sum + y;
      compensation = t - sum - y;
      sum = t;
    }
    return sum;
  };
}
