import { forwardRef, type Ref as R } from 'react';

export const Tag = forwardRef<HTMLSpanElement, { label: string }>((props, ref) => (
  <span ref={ref}>{props.label}</span>
));

export const Other: R<number> | null = null;
