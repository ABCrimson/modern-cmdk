import * as React from 'react';

interface Props {
  title: string;
}

export const Box = (
  {
    ref: forwardedRef,
    ...props
  }: Props & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => (<div ref={forwardedRef} title={props.title} />);
