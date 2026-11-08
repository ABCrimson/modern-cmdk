// tests/unit/react-props-eopt.test.ts
// The prop types of the React components (cluster C2), checked by `pnpm typecheck` and run by vitest.

import type { CommandPageId, CommandPageProps } from 'modern-cmdk/react';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('React prop types (C2)', () => {
  it('RA-62: CommandPageProps.id is a plain string', () => {
    expectTypeOf<CommandPageProps['id']>().toEqualTypeOf<string>();
    // A plain string literal is a CommandPageId
    const id: CommandPageId = 'settings';
    expect<CommandPageProps>({ id }).toEqual({ id: 'settings' });
  });
});
