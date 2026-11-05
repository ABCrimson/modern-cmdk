import * as R from 'react';

export const Item = R.forwardRef<HTMLLIElement, { id: string }>(({ id }, ref) => (
  <li ref={ref} id={id} />
));
