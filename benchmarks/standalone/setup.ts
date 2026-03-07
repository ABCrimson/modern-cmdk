// Polyfill Temporal and Math.sumPrecise for benchmark scripts
// Node doesn't ship these yet — same pattern as tests/setup.ts

import { Temporal as TemporalPolyfill } from '@js-temporal/polyfill';

if (typeof globalThis.Temporal === 'undefined') {
  // @ts-expect-error — polyfill assignment
  globalThis.Temporal = TemporalPolyfill;
}

if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = (values: Iterable<number>): number => {
    let sum = 0;
    for (const v of values) sum += v;
    return sum;
  };
}
