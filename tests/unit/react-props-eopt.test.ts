// tests/unit/react-props-eopt.test.ts
// The prop types of the React components (cluster C2), checked by `pnpm typecheck` and run by vitest.

import type {
  CommandAsyncItemsProps,
  CommandDialogProps,
  CommandErrorBoundaryProps,
  CommandGroupProps,
  CommandHighlightProps,
  CommandInputProps,
  CommandItemProps,
  CommandListProps,
  CommandLoadingProps,
  CommandPageId,
  CommandPageProps,
  CommandRootProps,
  CommandSeparatorProps,
  CommandShortcutProps,
  RegisterGroupOptions,
  RegisterItemOptions,
  VirtualizerOptions,
} from 'modern-cmdk/react';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('React prop types (C2)', () => {
  it('RA-62: CommandPageProps.id is a plain string', () => {
    expectTypeOf<CommandPageProps['id']>().toEqualTypeOf<string>();
    // A plain string literal is a CommandPageId
    const id: CommandPageId = 'settings';
    expect<CommandPageProps>({ id }).toEqual({ id: 'settings' });
  });

  it('ARCH-30: every React prop and hook option accepts an explicit undefined', () => {
    // Each alias sets every optional field of its type, own fields only, to an explicit undefined (required fields
    // keep a value). Under exactOptionalPropertyTypes a bare `?: T` rejects it, which is TS2375.
    type RootUndefined = { className: undefined; label: undefined; children: undefined };
    type DialogUndefined = {
      children: undefined;
      className: undefined;
      overlayClassName: undefined;
      contentClassName: undefined;
      label: undefined;
      open: undefined;
      onOpenChange: undefined;
      description: undefined;
      container: undefined;
    };
    type AsyncItemsUndefined = {
      items: CommandAsyncItemsProps['items'];
      children: CommandAsyncItemsProps['children'];
      fallback: undefined;
    };
    type ErrorBoundaryUndefined = {
      children: CommandErrorBoundaryProps['children'];
      fallback: undefined;
      resetKeys: undefined;
      onError: undefined;
    };
    type GroupUndefined = {
      heading: undefined;
      priority: undefined;
      id: undefined;
      forceId: undefined;
    };
    type HighlightUndefined = {
      text: string;
      ranges: CommandHighlightProps['ranges'];
      highlightClassName: undefined;
    };
    type InputUndefined = { value: undefined; onValueChange: undefined };
    type ItemUndefined = {
      value: string;
      keywords: undefined;
      onSelect: undefined;
      disabled: undefined;
      shortcut: undefined;
      id: undefined;
      forceId: undefined;
      propsMerge: undefined;
    };
    type ListUndefined = {
      virtualize: undefined;
      estimateSize: undefined;
      overscan: undefined;
      announceResults: undefined;
    };
    type LoadingUndefined = { loading: undefined };
    type PageUndefined = { id: string; children: undefined };
    type SeparatorUndefined = { alwaysRender: undefined };
    type ShortcutUndefined = { shortcut: undefined };
    type RegisterItemUndefined = {
      keywords: undefined;
      groupId: undefined;
      shortcut: undefined;
      disabled: undefined;
      onSelect: undefined;
      data: undefined;
      id: undefined;
      forceId: undefined;
    };
    type RegisterGroupUndefined = { priority: undefined; id: undefined; forceId: undefined };
    type VirtualizerUndefined = {
      count: number;
      estimateSize: number;
      scrollElement: null;
      overscan: undefined;
      enabled: undefined;
    };

    expectTypeOf<RootUndefined>().toExtend<CommandRootProps>();
    expectTypeOf<DialogUndefined>().toExtend<CommandDialogProps>();
    expectTypeOf<AsyncItemsUndefined>().toExtend<CommandAsyncItemsProps>();
    expectTypeOf<ErrorBoundaryUndefined>().toExtend<CommandErrorBoundaryProps>();
    expectTypeOf<GroupUndefined>().toExtend<CommandGroupProps>();
    expectTypeOf<HighlightUndefined>().toExtend<CommandHighlightProps>();
    expectTypeOf<InputUndefined>().toExtend<CommandInputProps>();
    expectTypeOf<ItemUndefined>().toExtend<CommandItemProps>();
    expectTypeOf<ListUndefined>().toExtend<CommandListProps>();
    expectTypeOf<LoadingUndefined>().toExtend<CommandLoadingProps>();
    expectTypeOf<PageUndefined>().toExtend<CommandPageProps>();
    expectTypeOf<SeparatorUndefined>().toExtend<CommandSeparatorProps>();
    expectTypeOf<ShortcutUndefined>().toExtend<CommandShortcutProps>();
    expectTypeOf<RegisterItemUndefined>().toExtend<RegisterItemOptions>();
    expectTypeOf<RegisterGroupUndefined>().toExtend<RegisterGroupOptions>();
    expectTypeOf<VirtualizerUndefined>().toExtend<VirtualizerOptions>();

    // A runtime value too: the props object holds what it was given.
    const props: CommandGroupProps = { heading: 'Fruit' };
    expect(props.heading).toBe('Fruit');
  });

  // The type is C3's (hooks/use-devtools.ts), which widens it in parallel; the assertion lands with that widening.
  it.todo(
    'ARCH-30: useCommandDevtools options accept an explicit undefined (flipped when C3 lands its widening)',
  );
});
