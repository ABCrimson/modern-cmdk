import * as React from 'react';

interface Props {
  title: string;
}

export const Box = React.forwardRef<HTMLDivElement, Props>((props, forwardedRef) => (
  <div ref={forwardedRef} title={props.title} />
));
