// tests/unit/telemetry.test.ts
// SEC-52 (telemetry half): createTelemetryMiddleware (packages/modern-cmdk/src/core/telemetry.ts).
// The other halves of SEC-52: the devtools hook is covered by tests/unit/use-devtools.test.tsx
// ('D30: the new and the deprecated global hold the same registry') and tests/unit/react-hooks.test.tsx ('T10: in
// production the mount and a later state change dispatch no event and create no global'); the create-modern-cmdk CLI
// by tests/dist/cli-exec.test.ts. The frecency
// flush-on-dispose half of SEC-02 is covered by tests/unit/frecency-machine.test.ts ('CE-02: await using flushes the
// pending save before the block ends' and 'CE-02: a synchronous dispose of a dirty machine still persists the selection').
// T11 (exports without tests): the sorted runtime export list is pinned by tests/dist/exports.test.ts.

import {
  type CommandTelemetryHooks,
  createTelemetryMiddleware,
  itemId,
  type TelemetryMiddleware,
} from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SEC-52: createTelemetryMiddleware', () => {
  it('SEC-52: onOpen calls onPaletteOpen and onClose reports the open-to-close duration in ms', () => {
    const onPaletteOpen = vi.fn();
    const onPaletteClose = vi.fn();
    const telemetry = createTelemetryMiddleware({ onPaletteOpen, onPaletteClose });

    telemetry.onOpen();
    expect(onPaletteOpen).toHaveBeenCalledOnce();
    expect(onPaletteClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    telemetry.onClose();
    expect(onPaletteClose).toHaveBeenCalledExactlyOnceWith(250);
  });

  it('CE-74: a wall-clock step does not change the reported session duration', () => {
    const onPaletteClose = vi.fn();
    const telemetry = createTelemetryMiddleware({ onPaletteClose });

    telemetry.onOpen();
    vi.advanceTimersByTime(250);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_600_000); // the clock steps back an hour
    telemetry.onClose();
    expect(onPaletteClose).toHaveBeenCalledExactlyOnceWith(250);
  });

  it('SEC-52: onClose without a preceding onOpen reports nothing', () => {
    const onPaletteClose = vi.fn();
    createTelemetryMiddleware({ onPaletteClose }).onClose();
    expect(onPaletteClose).not.toHaveBeenCalled();
  });

  it('SEC-52: a second onClose reports nothing until the next onOpen, and each session is timed from its own open', () => {
    const onPaletteClose = vi.fn();
    const telemetry = createTelemetryMiddleware({ onPaletteClose });

    telemetry.onOpen();
    vi.advanceTimersByTime(100);
    telemetry.onClose();
    vi.advanceTimersByTime(5_000);
    telemetry.onClose();
    expect(onPaletteClose).toHaveBeenCalledTimes(1);

    telemetry.onOpen();
    vi.advanceTimersByTime(40);
    telemetry.onClose();
    expect(onPaletteClose.mock.calls).toEqual([[100], [40]]);
  });

  it('SEC-52: a second onOpen restarts the session clock', () => {
    const onPaletteClose = vi.fn();
    const telemetry = createTelemetryMiddleware({ onPaletteClose });

    telemetry.onOpen();
    vi.advanceTimersByTime(900);
    telemetry.onOpen();
    vi.advanceTimersByTime(30);
    telemetry.onClose();
    expect(onPaletteClose).toHaveBeenCalledExactlyOnceWith(30);
  });

  it('SEC-52: onSearch reports the query, the result count and the time since startTime', () => {
    const onSearchComplete = vi.fn();
    const telemetry = createTelemetryMiddleware({ onSearchComplete });

    const startTime = performance.now();
    vi.advanceTimersByTime(12);
    telemetry.onSearch('app', 7, startTime);
    expect(onSearchComplete).toHaveBeenCalledExactlyOnceWith('app', 7, 12);
  });

  it('CE-74: onSearch measures a performance.now() startTime on the same clock', () => {
    const onSearchComplete = vi.fn();
    const telemetry = createTelemetryMiddleware({ onSearchComplete });

    const startTime = performance.now();
    vi.advanceTimersByTime(20);
    // A wall-clock step does not reach the duration
    vi.setSystemTime(Date.now() - 3_600_000);
    telemetry.onSearch('app', 1, startTime);
    expect(onSearchComplete).toHaveBeenCalledExactlyOnceWith('app', 1, 20);
  });

  it('CE-74: an onSearch startTime from Date.now() still reports the elapsed time', () => {
    const onSearchComplete = vi.fn();
    const telemetry = createTelemetryMiddleware({ onSearchComplete });

    // An epoch reading (above 1e12) is measured against Date.now(), as the published docs describe
    vi.setSystemTime(1_700_000_000_000);
    const startTime = Date.now();
    vi.advanceTimersByTime(12);
    telemetry.onSearch('app', 7, startTime);
    expect(onSearchComplete).toHaveBeenCalledExactlyOnceWith('app', 7, 12);
  });

  it('SEC-52: onSelect passes the item id, the active query and the position through unchanged', () => {
    const onItemSelected = vi.fn();
    const telemetry = createTelemetryMiddleware({ onItemSelected });

    const id = itemId('open-settings');
    telemetry.onSelect(id, 'set', 2);
    expect(onItemSelected).toHaveBeenCalledExactlyOnceWith(id, 'set', 2);
  });

  it('SEC-52: with no hooks every method is a harmless no-op', () => {
    const telemetry = createTelemetryMiddleware({});
    expect(() => {
      telemetry.onOpen();
      telemetry.onSearch('q', 0, performance.now());
      telemetry.onSelect(itemId('x'), 'q', 0);
      telemetry.onClose();
    }).not.toThrow();
  });

  it('SEC-52: each hook fires only for its own event', () => {
    const hooks = {
      onPaletteOpen: vi.fn(),
      onPaletteClose: vi.fn(),
      onSearchComplete: vi.fn(),
      onItemSelected: vi.fn(),
    };
    const telemetry = createTelemetryMiddleware(hooks);

    telemetry.onSearch('a', 1, performance.now());
    expect(hooks.onSearchComplete).toHaveBeenCalledTimes(1);
    expect(hooks.onPaletteOpen).not.toHaveBeenCalled();
    expect(hooks.onPaletteClose).not.toHaveBeenCalled();
    expect(hooks.onItemSelected).not.toHaveBeenCalled();

    telemetry.onSelect(itemId('a'), 'a', 0);
    expect(hooks.onItemSelected).toHaveBeenCalledTimes(1);
    expect(hooks.onSearchComplete).toHaveBeenCalledTimes(1);
  });

  it('SEC-52: two middlewares keep separate session clocks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = createTelemetryMiddleware({ onPaletteClose: first });
    const b = createTelemetryMiddleware({ onPaletteClose: second });

    a.onOpen();
    vi.advanceTimersByTime(10);
    b.onOpen();
    vi.advanceTimersByTime(10);
    a.onClose();
    b.onClose();
    expect(first).toHaveBeenCalledExactlyOnceWith(20);
    expect(second).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('T11: the middleware exposes exactly onOpen, onClose, onSearch and onSelect', () => {
    const telemetry = createTelemetryMiddleware({});
    expect(Object.keys(telemetry).sort()).toEqual(['onClose', 'onOpen', 'onSearch', 'onSelect']);
  });

  it('T11: the exported hook and middleware types describe the factory', () => {
    expectTypeOf(createTelemetryMiddleware).parameter(0).toEqualTypeOf<CommandTelemetryHooks>();
    expectTypeOf(createTelemetryMiddleware).returns.toEqualTypeOf<TelemetryMiddleware>();
    expectTypeOf<CommandTelemetryHooks['onPaletteClose']>().toEqualTypeOf<
      ((durationMs: number) => void) | undefined
    >();
    expectTypeOf<CommandTelemetryHooks['onSearchComplete']>().toEqualTypeOf<
      ((query: string, resultCount: number, durationMs: number) => void) | undefined
    >();
    expectTypeOf<TelemetryMiddleware['onSearch']>().toEqualTypeOf<
      (query: string, resultCount: number, startTime: number) => void
    >();
    expectTypeOf<Partial<CommandTelemetryHooks>>().toEqualTypeOf<CommandTelemetryHooks>();
    // The runtime half: a bare factory result is usable under those types.
    const telemetry: TelemetryMiddleware = createTelemetryMiddleware({});
    expect(telemetry.onOpen).toBeTypeOf('function');
  });
});
