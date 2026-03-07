import { describe, expect, it } from 'vitest';

describe('package exports', () => {
  it('core package exports all public API', async () => {
    const core = await import('@crimson_dev/command');
    expect(core.createCommandMachine).toBeTypeOf('function');
    expect(core.createSearchEngine).toBeTypeOf('function');
    expect(core.itemId).toBeTypeOf('function');
    expect(core.groupId).toBeTypeOf('function');
    expect(core.FrecencyEngine).toBeTypeOf('function');
    expect(core.KeyboardShortcutRegistry).toBeTypeOf('function');
    expect(core.TypedEmitter).toBeTypeOf('function');
  });

  it('react package exports all components and hooks', async () => {
    const react = await import('@crimson_dev/command-react');
    expect(react.Command).toBeDefined();
    expect(react.useCommand).toBeTypeOf('function');
    expect(react.useCommandState).toBeTypeOf('function');
    expect(react.useRegisterItem).toBeTypeOf('function');
    expect(react.useRegisterGroup).toBeTypeOf('function');
    expect(react.useVirtualizer).toBeTypeOf('function');
    expect(react.CommandHighlight).toBeDefined();
    expect(react.CommandActivity).toBeDefined();
  });

  it('core exports type-safe ID constructors', async () => {
    const { itemId, groupId } = await import('@crimson_dev/command');
    const id = itemId('test');
    const gid = groupId('group');
    expect(typeof id).toBe('string');
    expect(typeof gid).toBe('string');
  });
});
