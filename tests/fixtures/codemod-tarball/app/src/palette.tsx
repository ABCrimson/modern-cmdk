import type { ReactElement } from 'react';

// Picks the first item of a palette that mirrors cmdk's markup.
export function firstItem(root: ParentNode): Element | null {
  return root.querySelector('[cmdk-item]');
}

export function Palette(): ReactElement {
  return (
    <div cmdk-root="" className="palette">
      <input cmdk-input="" />
      <div cmdk-list="">
        <div cmdk-item="">item</div>
      </div>
    </div>
  );
}
