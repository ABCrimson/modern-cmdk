import { describe, expect, it } from 'vitest';

describe('package exports', () => {
  it('core package exports all public API', async () => {
    const core = await import('@crimson_dev/command');
    // Vitest 4.1 — use expect.soft() for non-fatal assertions so all exports are checked
    expect.soft(core.createCommandMachine).toBeTypeOf('function');
    expect.soft(core.createSearchEngine).toBeTypeOf('function');
    expect.soft(core.itemId).toBeTypeOf('function');
    expect.soft(core.groupId).toBeTypeOf('function');
    expect.soft(core.FrecencyEngine).toBeTypeOf('function');
    expect.soft(core.KeyboardShortcutRegistry).toBeTypeOf('function');
    expect.soft(core.TypedEmitter).toBeTypeOf('function');
  });

  it('react package exports all components and hooks', async () => {
    const react = await import('@crimson_dev/command-react');
    // Vitest 4.1 — soft assertions to report all missing exports at once
    expect.soft(react.Command).toBeDefined();
    expect.soft(react.useCommand).toBeTypeOf('function');
    expect.soft(react.useCommandState).toBeTypeOf('function');
    expect.soft(react.useRegisterItem).toBeTypeOf('function');
    expect.soft(react.useRegisterGroup).toBeTypeOf('function');
    expect.soft(react.useVirtualizer).toBeTypeOf('function');
    expect.soft(react.CommandHighlight).toBeDefined();
    expect.soft(react.CommandActivity).toBeDefined();
  });

  it('core exports type-safe ID constructors', async () => {
    const { itemId, groupId } = await import('@crimson_dev/command');
    const id = itemId('test');
    const gid = groupId('group');
    expect(typeof id).toBe('string');
    expect(typeof gid).toBe('string');
  });
});
