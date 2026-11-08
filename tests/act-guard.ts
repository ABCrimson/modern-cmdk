// tests/act-guard.ts
// The React act-warning guard's store, shared by tests/setup.ts (which installs the console.error wrapper and fails
// the test in afterEach) and by every test that silences console.error. A warning is recorded when console.error is
// called, so the state of a spy at the end of the test (restored in the test body, restored by vi.restoreAllMocks()
// in an afterEach, or left installed) cannot hide it. tests/unit/act-guard-usage.test.ts fails any other file that
// spies on or assigns console.error; a test that asserts on the calls uses the MockInstance silenceConsoleError() returns.

import { format } from 'node:util';
import { type MockInstance, vi } from 'vitest';

const ACT_WARNING = /not wrapped in act|suspended inside an `act` scope/;
const actWarnings: string[] = [];

/** Records the console.error arguments when they are a React act warning. */
export function noteActWarning(args: readonly unknown[]): void {
  const text = format(...args);
  if (ACT_WARNING.test(text)) actWarnings.push(text);
}

/** The distinct warning texts recorded since the last call, in order; empties the store. */
export function drainActWarnings(): string[] {
  const distinct = [...new Set(actWarnings)];
  actWarnings.length = 0;
  return distinct;
}

/** Spies on console.error with an implementation that prints nothing but still records act warnings. Restore it as any spy. */
export function silenceConsoleError(): MockInstance<Console['error']> {
  return vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    noteActWarning(args);
  });
}
