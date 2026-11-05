import { createElement, type Ref } from 'react';

export const A = (
  {
    ref,
    id
  }: { id: string } & {
    ref?: Ref<HTMLDivElement>;
  }
) => createElement('div', { ref, id });
