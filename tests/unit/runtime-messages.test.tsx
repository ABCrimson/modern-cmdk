// tests/unit/runtime-messages.test.tsx
// The error a part throws outside the palette names both roots that provide the context.

import { Command, useCommandState } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

function StateProbe(): ReactNode {
  useCommandState();
  return null;
}

describe('the context error of a part rendered outside the palette', () => {
  it('Command.Item names <Command> and <Command.Dialog>', () => {
    expect(() => renderToString(<Command.Item value="copy" />)).toThrow(
      'Command.Item must be used within <Command> or <Command.Dialog>',
    );
  });

  it('useCommandState names <Command> and <Command.Dialog>', () => {
    expect(() => renderToString(<StateProbe />)).toThrow(
      'useCommandState must be used within <Command> or <Command.Dialog>',
    );
  });
});
