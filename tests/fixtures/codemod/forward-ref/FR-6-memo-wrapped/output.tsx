import { memo, type Ref } from 'react';

export const A = memo((
  {
    ref,
    ...props
  }: { id: string } & {
    ref?: Ref<HTMLDivElement>;
  }
) => (<div ref={ref} id={props.id} />));
