// tests/setup.ts
// Vitest 4.1 global setup — polyfills ES2026 APIs not yet in the test runtime

// React 19 act() environment — suppresses "not configured to support act()" warnings
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

// Polyfill RegExp.escape if not natively available (ES2026)
if (typeof RegExp.escape !== 'function') {
  // @ts-expect-error — polyfill assignment
  RegExp.escape = function regExpEscape(str: string): string {
    return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  };
}
