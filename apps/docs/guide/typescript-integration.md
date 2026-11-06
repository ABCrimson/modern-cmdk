# TypeScript Integration

modern-cmdk is built with TypeScript 7.1.0-dev.20261106.1 and provides first-class type safety.

## Branded IDs

Item and group identifiers use branded types to prevent accidental mixing:

```ts
import { groupId, itemId } from 'modern-cmdk';
import type { GroupId } from 'modern-cmdk';

const myItem = itemId('copy');   // type: ItemId (branded string)
const myGroup = groupId('edit'); // type: GroupId (branded string)

// Type error — cannot assign ItemId to GroupId
// @ts-expect-error TS2322: ItemId is not assignable to GroupId
const wrong: GroupId = myItem;
```

## Type-Safe Machine Options

The `createCommandMachine` options are fully typed, so callback parameters are inferred:

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

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

The machine implements `Disposable` for the `using` keyword (ESNext explicit resource management):

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';

const items: readonly CommandItem[] = [{ id: itemId('copy'), value: 'Copy' }];

{
  using machine = createCommandMachine({ items });
  // machine is automatically disposed when leaving this block
}
```

## Readonly State

All state objects are deeply immutable at the type level:

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

const machine = createCommandMachine();
const state = machine.getState();
// @ts-expect-error TS2540: readonly property
state.search = 'new';
// @ts-expect-error TS2339: readonly array has no push
state.filteredIds.push(itemId('x'));
```

## isolatedDeclarations

All packages are built with `isolatedDeclarations: true`, ensuring `.d.ts` files are generated without full type inference — faster builds and compatible with any bundler.

## erasableSyntaxOnly

The codebase uses only erasable TypeScript syntax (no enums, no namespaces, no constructor parameter properties). This means any tool that strips types works correctly: Node's built-in type stripping first, then esbuild, swc and Bun.

Node runs `.ts` files by stripping the types, with no flag, from v23.6.0 and v22.18.0 (type stripping is stable from v25.2.0 and v24.12.0), per [nodejs.org/api/typescript.html](https://nodejs.org/api/typescript.html), read on 2026-11-04. On the Node pinned in `.nvmrc` (28.0.0-nightly20261106ec4d4c2950):

```bash
node -p process.features.typescript
# strip
```

`strip` is the default value; it is `false` when Node runs with `--no-strip-types` (nodejs.org/api/process.html). Stripping handles only erasable syntax, which is why this codebase restricts itself to it.
