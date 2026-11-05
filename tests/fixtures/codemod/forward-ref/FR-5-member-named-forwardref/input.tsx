import { forwardRef, useId } from 'react';

const api = { forwardRef: 1 };
export const A = forwardRef(({ id }, ref) => <li ref={ref} id={id + api.forwardRef + useId()} />);
