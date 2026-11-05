import { forwardRef, createElement } from 'react';

export const A = forwardRef<HTMLDivElement, { id: string }>(({ id }, ref) =>
  createElement('div', { ref, id }),
);
