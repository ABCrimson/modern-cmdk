import { forwardRef } from './my-forward-ref';

export const Item = forwardRef(({ id }, ref) => <li ref={ref} id={id} />);
