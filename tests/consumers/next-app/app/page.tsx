// Server component. It builds the items with a pure core export, hands serializable props to the
// client palette, and renders a second palette straight from RSC: dist/react's 'use client'
// banner makes each named export a client reference. Members of `Command` (Command.Input ...) are
// never read here, because a property read on a client reference fails in RSC.

import { itemId } from 'modern-cmdk';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import type { PaletteItem } from './palette';
import { Palette } from './palette';

export default function Page(): ReactNode {
  const items: readonly PaletteItem[] = Array.from(
    { length: 5 },
    (_, index: number): PaletteItem => ({
      id: itemId(`item-${index + 1}`),
      label: `Item ${index + 1}`,
    }),
  );

  return (
    <main>
      <section data-palette="client">
        <Palette items={items} />
      </section>
      <section data-palette="server">
        <Command label="server">
          <CommandInput />
          <CommandList>
            <CommandItem value="a">
              A<CommandShortcut shortcut="Mod+K" data-shortcut="item" />
            </CommandItem>
          </CommandList>
        </Command>
      </section>
    </main>
  );
}
