import { forwardRef, memo } from 'react';

export const A = memo(forwardRef<HTMLDivElement, { id: string }>((props, ref) => (
  <div ref={ref} id={props.id} />
)));
