import { useId } from 'react';

const api = { forwardRef: 1 };
export const A = (
  {
    ref,
    id
  }
) => <li ref={ref} id={id + api.forwardRef + useId()} />;
