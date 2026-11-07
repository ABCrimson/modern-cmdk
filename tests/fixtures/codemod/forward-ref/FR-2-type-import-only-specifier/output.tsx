import { type Ref } from 'react';

export const Tag = (
  {
    ref,
    ...props
  }: { label: string } & {
    ref?: Ref<HTMLSpanElement>;
  }
) => (<span ref={ref}>{props.label}</span>);
