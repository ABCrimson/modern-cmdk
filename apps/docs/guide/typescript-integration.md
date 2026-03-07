# TypeScript Integration

@crimson_dev/command is built with TypeScript 6.0.1 and provides first-class type safety.

## Branded IDs

Item and group identifiers use branded types to prevent accidental mixing:

```ts
import { itemId, groupId } from '@crimson_dev/command';

const myItem = itemId('copy');   // type: ItemId (branded string)
const myGroup = groupId('edit'); // type: GroupId (branded string)

// Type error — cannot assign ItemId to GroupId
const wrong: GroupId = myItem; // TS Error!
```

## Type-Safe Machine Options

The `createCommandMachine` options use `NoInfer<T>` to prevent accidental type widening:

```ts
const machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy' },
  ],
  onSelect: (id) => {
    // `id` is inferred as ItemId, not string
    console.log(id);
  },
});
```

## Disposable Pattern

The machine implements `Disposable` for the ES2026 `using` keyword:

```ts
{
  using machine = createCommandMachine({ items });
  // machine is automatically disposed when leaving this block
}
```

## Readonly State

All state objects are deeply immutable at the type level:

```ts
const state = machine.getState();
state.search = 'new'; // TS Error — readonly property
state.filteredIds.push(itemId('x')); // TS Error — readonly array
```

## isolatedDeclarations

All packages are built with `isolatedDeclarations: true`, ensuring `.d.ts` files are generated without full type inference — faster builds and compatible with any bundler.

## erasableSyntaxOnly

The codebase uses only erasable TypeScript syntax (no enums, no namespaces, no constructor parameter properties). This means any tool that strips types (esbuild, swc, Bun) works correctly.
