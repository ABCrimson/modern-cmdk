import React from 'react';

type Props = { label: string };

export const Tag = (
  {
    ref,
    ...props
  }: Props & {
    ref?: React.Ref<HTMLSpanElement>;
  }
) => (<span ref={ref}>{props.label}</span>);
