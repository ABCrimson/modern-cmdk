import { forwardRef } from 'react';

export const Tag = forwardRef<HTMLSpanElement, { label: string }>((props, ref) => (
  <span ref={ref}>{props.label}</span>
));
