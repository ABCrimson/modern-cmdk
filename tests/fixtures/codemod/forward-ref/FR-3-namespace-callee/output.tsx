import * as R from 'react';

export const Item = (
  {
    ref,
    id
  }: { id: string } & {
    ref?: R.Ref<HTMLLIElement>;
  }
) => (<li ref={ref} id={id} />);
