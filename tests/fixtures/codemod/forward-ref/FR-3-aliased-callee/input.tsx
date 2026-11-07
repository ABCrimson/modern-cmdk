import { forwardRef as fr } from 'react';

export const Item = fr(({ id }, ref) => <li ref={ref} id={id} />);
