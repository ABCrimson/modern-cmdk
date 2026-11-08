// apps/playground/src/bench/recorder.ts
// The in-page measurement of the /bench route (ruling R5). Pure browser code, no React: the page
// feeds it the machine (from its probe component's layout effect), the Profiler callback and the
// keystroke, and it publishes one BenchState object on window.__cmdkBench.
//
// Definitions (the harness copies them into the results JSON):
//   mount                = the first REGISTER_ITEM sent to the machine -> the first state emit whose
//                          filteredIds holds all N items (performance.mark/measure).
//   filter               = a keystroke on the input (capturing keydown listener) -> the first state emit
//                          whose search equals the new query.
//   keystroke-to-paint   = the same keystroke -> the requestAnimationFrame callback scheduled from that
//                          emit (the callback runs at the start of the next frame, before it paints).
//   React commit (recorded, not gated) = the sum of Profiler onRender actualDuration over the mount's
//                          commits (first render through the first commit after the all-N emit) and over
//                          the filter's commits (keydown through the paint mark).

import type { CommandMachine, CommandState } from 'modern-cmdk';
import type { ProfilerOnRenderCallback } from 'react';
import type { BenchFilterResult, BenchMountResult, BenchSize, BenchState } from './result-types.js';

export interface Recorder {
  readonly onRender: ProfilerOnRenderCallback;
  /** Wrap machine.send, subscribe to state emits and listen for the keystroke; returns the uninstall function. */
  install(machine: CommandMachine): () => void;
  /** Publish an error: window.__cmdkBench.phase becomes 'error' and a role=alert element shows the message. */
  fail(message: string): void;
}

function publish(state: BenchState): void {
  window.__cmdkBench = state;
}

/** Surface an error on the page and in window.__cmdkBench; the first message wins. */
export function failBench(message: string): void {
  if (window.__cmdkBench?.phase === 'error') return;
  publish({ phase: 'error', message });
  const alert = document.createElement('pre');
  alert.setAttribute('role', 'alert');
  alert.id = 'bench-error';
  alert.style.cssText = 'color:#b00020;white-space:pre-wrap;padding:1rem;font:14px monospace';
  alert.textContent = `bench error: ${message}`;
  document.body.prepend(alert);
}

function measureBetween(name: string, start: string, end: string): number {
  return performance.measure(name, start, end).duration;
}

export function createRecorder(n: BenchSize): Recorder {
  // --- mount ---
  let registryAtInstall = -1;
  let registerSends = 0;
  let mountStarted = false;
  let mountEmitted = false;
  let mountMs = 0;
  let mountClosed = false;
  let mountCommitMs = 0;
  let mountCommitCount = 0;
  let mount: BenchMountResult | null = null;
  // After the all-N emit the list can still register again: <Command.List> switches from its plain
  // wrapper to the virtual one once filteredCount passes 100, which remounts every item (N
  // UNREGISTER_ITEM then N REGISTER_ITEM sends, processed on the next scheduler tick). The page is
  // published as mounted only after that settles, so the keystroke never lands inside it.
  let sendsAfterMount = 0;
  let emitsAfterMount = 0;

  // --- filter ---
  let expectedQuery: string | null = null;
  let filterEmitted = false;
  let filterMs = 0;
  let filteredCount = 0;
  let filterWindowOpen = false;
  let filterCommitMs = 0;
  let filterCommitCount = 0;

  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    if (!mountClosed) {
      mountCommitMs += actualDuration;
      mountCommitCount += 1;
      // The first commit after the all-N emit closes the mount window.
      if (mountEmitted) {
        mountClosed = true;
        settle();
      }
    } else if (filterWindowOpen) {
      filterCommitMs += actualDuration;
      filterCommitCount += 1;
    }
  };

  /** Publish 'mounted' once two consecutive frames saw no new register/unregister sends and every send has been answered by an emit. */
  function settle(): void {
    let lastSends = -1;
    let calmFrames = 0;
    const tick = (): void => {
      const quiet = sendsAfterMount === lastSends && emitsAfterMount >= sendsAfterMount;
      calmFrames = quiet ? calmFrames + 1 : 0;
      lastSends = sendsAfterMount;
      if (calmFrames < 2) {
        requestAnimationFrame(tick);
        return;
      }
      mount = {
        n,
        mount_ms: mountMs,
        mount_commit_ms: mountCommitMs,
        mount_commit_count: mountCommitCount,
        register_sends: registerSends,
        registry_size_at_install: registryAtInstall,
        sends_after_mount: sendsAfterMount,
      };
      publish({ phase: 'mounted', mount });
    };
    requestAnimationFrame(tick);
  }

  function onEmit(state: CommandState): void {
    if (mountEmitted) emitsAfterMount += 1;
    if (!mountEmitted && state.filteredIds.length === n) {
      if (registerSends !== n) {
        failBench(
          `the all-${n} emit arrived after ${registerSends} REGISTER_ITEM sends, expected ${n}`,
        );
        return;
      }
      performance.mark('bench:mount:end');
      mountMs = measureBetween('bench:mount', 'bench:mount:start', 'bench:mount:end');
      mountEmitted = true;
      return;
    }
    if (expectedQuery !== null && !filterEmitted && state.search === expectedQuery) {
      const query = expectedQuery;
      filterEmitted = true;
      filteredCount = state.filteredCount;
      performance.mark('bench:filter:end');
      filterMs = measureBetween('bench:filter', 'bench:filter:start', 'bench:filter:end');
      requestAnimationFrame(() => {
        performance.mark('bench:paint');
        const paintMs = measureBetween(
          'bench:keystroke-to-paint',
          'bench:filter:start',
          'bench:paint',
        );
        filterWindowOpen = false;
        if (mount === null) {
          failBench('the filter finished before the mount result was published');
          return;
        }
        const filter: BenchFilterResult = {
          query,
          filter_ms: filterMs,
          keystroke_to_paint_ms: paintMs,
          filter_commit_ms: filterCommitMs,
          filter_commit_count: filterCommitCount,
          filtered_count: filteredCount,
        };
        publish({ phase: 'filtered', mount, filter });
      });
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-command-input]')) return;
    if (mount === null) {
      failBench('a keystroke arrived before the mount result was published');
      return;
    }
    if (expectedQuery !== null) {
      failBench('a second keystroke arrived: the page measures exactly one');
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      failBench(`keystroke '${event.key}' is not one printable character`);
      return;
    }
    expectedQuery = input.value + event.key;
    filterWindowOpen = true;
    performance.mark('bench:filter:start');
  }

  return {
    onRender,
    fail: failBench,
    install(machine: CommandMachine): () => void {
      registryAtInstall = machine.getRegistry().size;
      if (registryAtInstall !== 0) {
        failBench(
          `the probe installed with ${registryAtInstall} items already registered: its layout effect must run before every item's`,
        );
      }
      const send = machine.send;
      machine.send = (event): void => {
        if (event.type === 'REGISTER_ITEM') {
          if (!mountStarted) {
            mountStarted = true;
            performance.mark('bench:mount:start');
          }
          if (!mountEmitted) registerSends += 1;
        }
        if (mountEmitted && (event.type === 'REGISTER_ITEM' || event.type === 'UNREGISTER_ITEM')) {
          sendsAfterMount += 1;
        }
        send.call(machine, event);
      };
      const subscription = machine.subscribeState(onEmit);
      document.addEventListener('keydown', onKeydown, { capture: true });
      return (): void => {
        document.removeEventListener('keydown', onKeydown, { capture: true });
        subscription[Symbol.dispose]();
        machine.send = send;
      };
    },
  };
}
