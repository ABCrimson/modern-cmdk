import { forwardRef } from 'react';

export const A = forwardRef(({ id }, ref) => <li ref={ref} id={id} />);
export const kind = typeof forwardRef;
