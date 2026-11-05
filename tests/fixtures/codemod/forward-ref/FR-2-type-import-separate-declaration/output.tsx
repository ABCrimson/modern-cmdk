import type { Ref } from 'react';
type Props = { label: string };
export const Tag = (
  {
    ref,
    ...props
  }: Props & {
    ref?: Ref<HTMLSpanElement>;
  }
) => <span ref={ref}>{props.label}</span>;
export const r: Ref<HTMLElement> | null = null;
