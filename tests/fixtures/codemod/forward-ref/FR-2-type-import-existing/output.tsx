import { type Ref as R } from 'react';

export const Tag = (
  {
    ref,
    ...props
  }: { label: string } & {
    ref?: R<HTMLSpanElement>;
  }
) => (<span ref={ref}>{props.label}</span>);

export const Other: R<number> | null = null;
