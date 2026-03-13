// Polyfill Math.sumPrecise and RegExp.escape for benchmark scripts
// Node doesn't ship these yet — same pattern as tests/setup.ts

if (typeof Math.sumPrecise !== 'function') {
  // @ts-expect-error — polyfill assignment
  Math.sumPrecise = (values: Iterable<number>): number => {
    // Kahan compensated summation for high precision
    let sum = 0;
    let compensation = 0;
    for (const v of values) {
      const y = v - compensation;
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
  RegExp.escape = (str: string): string => {
    return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  };
}
