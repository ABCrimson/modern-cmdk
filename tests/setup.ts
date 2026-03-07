// tests/setup.ts
// Vitest global setup — polyfills ES2026 APIs not yet in the test runtime

import 'fake-indexeddb/auto';
import { Temporal as TemporalPolyfill } from '@js-temporal/polyfill';

// Polyfill Temporal if not natively available
if (typeof globalThis.Temporal === 'undefined') {
  // @ts-expect-error — polyfill assignment to global
  globalThis.Temporal = TemporalPolyfill;
}

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
