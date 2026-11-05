// tests/unit/dialog-subpath.test.tsx
// The modern-cmdk/react/dialog subpath (RP-02), resolved to src, is the barrel's CommandDialog.

import * as react from 'modern-cmdk/react';
import * as dialog from 'modern-cmdk/react/dialog';
import { describe, expect, it } from 'vitest';

describe('modern-cmdk/react/dialog (src)', () => {
  it('exports the same CommandDialog as modern-cmdk/react', () => {
    expect.hasAssertions();
    expect(Object.keys(dialog)).toEqual(['CommandDialog']);
    expect(dialog.CommandDialog).toBe(react.CommandDialog);
    expect(dialog.CommandDialog).toBe(react.Command.Dialog);
  });
});
