// tests/setup.ts
// Vitest 5 setup file — act() environment, fake-indexeddb, and the one ES2026 polyfill
// the supported runtimes still lack (Math.sumPrecise: absent on Node 26.13, native on 27).

// React act() environment — suppresses "not configured to support act()" warnings.
// The tests drive react-dom/client + act() directly (no @testing-library/react), so
// nothing else sets this flag.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import 'fake-indexeddb/auto';

// Polyfill Math.sumPrecise if not natively available
if (typeof Math.sumPrecise !== 'function') {
  // @ts-expect-error — polyfill assignment
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
