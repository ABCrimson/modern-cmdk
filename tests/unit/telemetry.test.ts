// tests/unit/telemetry.test.ts
// SEC-52 (telemetry half): createTelemetryMiddleware (packages/modern-cmdk/src/core/telemetry.ts).
// The other halves of SEC-52: the devtools hook is covered by tests/unit/use-devtools.test.tsx
// ('SEC-52: registers the label when NODE_ENV is development' and 'SEC-52: leaves the registry uncreated
// when NODE_ENV is production'); the create-modern-cmdk CLI by tests/dist/cli-exec.test.ts. What remains
// open is the frecency flush-on-dispose test, which belongs to SEC-02 (1.6.0).

import { createTelemetryMiddleware, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      telemetry.onSearch('q', 0, Date.now());
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

    telemetry.onSearch('a', 1, Date.now());
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
});
