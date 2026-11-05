import type { ReactElement } from 'react';

// Picks the first item of a palette that mirrors cmdk's markup.
export function firstItem(root: ParentNode): Element | null {
  return root.querySelector('[data-command-item]');
}

export function Palette(): ReactElement {
  return (
    <div data-command-root="" className="palette">
      <input data-command-input="" />
      <div data-command-list="">
        <div data-command-item="">item</div>
      </div>
    </div>
  );
}
