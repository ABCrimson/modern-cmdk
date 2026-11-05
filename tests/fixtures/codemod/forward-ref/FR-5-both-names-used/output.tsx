import { forwardRef } from 'react';

export const A = (
  {
    ref,
    id
  }
) => <li ref={ref} id={id} />;
export const B = forwardRef(Inner);
