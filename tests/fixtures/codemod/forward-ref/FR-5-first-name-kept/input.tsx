import { forwardRef as fr, forwardRef } from 'react';

export const A = forwardRef(({ id }, ref) => <li ref={ref} id={id} />);
export const B = fr(Inner);
