import * as React from 'react';

export const U = (
  {
    ref,
    ...props
  }: ({ a: number } | { b: string }) & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => (<div ref={ref} data-kind={'a' in props} />);
