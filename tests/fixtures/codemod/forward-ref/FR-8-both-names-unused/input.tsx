import { forwardRef as fr, forwardRef } from 'react';

export const A = fr(({ id }, ref) => <li ref={ref} id={id} />);
export const B = forwardRef(({ id }, ref) => <li ref={ref} id={id} />);
