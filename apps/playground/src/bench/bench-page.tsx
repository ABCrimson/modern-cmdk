// apps/playground/src/bench/bench-page.tsx
// The /bench route (ruling R5): one <Command> with N <Command.Item> children inside a React
// <Profiler>, measured in-page by recorder.ts. Not linked from anywhere and not rendered in StrictMode
// (a double-invoked layout effect would register every item twice and measure that instead).
// ?n= takes 1000 or 10000 only; anything else is a visible error and a rejected result.
// Defaults for everything else: this is what users get.

import { Command, CommandStableContext } from 'modern-cmdk/react';
import { Profiler, type ReactNode, use, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type DatasetVariant, itemSeeds } from './dataset.js';
import { createRecorder, failBench, type Recorder } from './recorder.js';
import { BENCH_SIZES, type BenchSize } from './result-types.js';

/** The CI baseline's dataset (benchmarks/filter-10k.bench.ts, compare-baseline.ts). */
const VARIANT: DatasetVariant = 'basic';

function parseSize(search: string): BenchSize | null {
  const raw = new URLSearchParams(search).get('n');
  const parsed = raw !== null && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return BENCH_SIZES.find((size) => size === parsed) ?? null;
}

/**
 * First child of <Command>: its layout effect runs before any item's registration layout effect
 * (effects run in tree order, earlier siblings first), so it wraps machine.send before the first
 * REGISTER_ITEM. The recorder verifies that with the registry size at install and the send count.
 */
function Probe({ recorder }: { readonly recorder: Recorder }): null {
  const stable = use(CommandStableContext);
  const machine = stable?.machine;
  useLayoutEffect(() => {
    if (machine === undefined) {
      recorder.fail('Probe rendered outside <Command>: no machine in CommandStableContext');
      return;
    }
    return recorder.install(machine);
  }, [machine, recorder]);
  return null;
}

function BenchApp({ n }: { readonly n: BenchSize }): ReactNode {
  const [recorder] = useState(() => createRecorder(n));
  const [seeds] = useState(() => itemSeeds(n, VARIANT));
  return (
    <Profiler id="bench" onRender={recorder.onRender}>
      <Command label={`Bench ${n}`}>
        <Probe recorder={recorder} />
        <Command.Input />
        <Command.List>
          {seeds.map((seed) => (
            <Command.Item key={seed.id} value={seed.value} keywords={seed.keywords}>
              {seed.value}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </Profiler>
  );
}

/** Mount the bench page into root. Errors anywhere on the page become window.__cmdkBench.phase = 'error'. */
export function renderBench(root: HTMLElement): void {
  window.__cmdkBench = { phase: 'loading' };
  window.addEventListener('error', (event) => {
    failBench(
      event.error instanceof Error ? (event.error.stack ?? event.error.message) : event.message,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    failBench(`unhandled rejection: ${String(event.reason)}`);
  });
  const n = parseSize(location.search);
  if (n === null) {
    failBench(
      `?n= must be one of ${BENCH_SIZES.join(', ')}; got ${JSON.stringify(location.search)}`,
    );
    return;
  }
  createRoot(root).render(<BenchApp n={n} />);
}
