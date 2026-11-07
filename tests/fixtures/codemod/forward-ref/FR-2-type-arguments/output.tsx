import React from 'react';

type PanelProps = { open: boolean };

export const Panel = (
  {
    ref,
    open
  }: PanelProps & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => (<div ref={ref} hidden={!open} />);

export const Wide = (
  {
    ref,
    ...props
  }: PanelProps & { extra: number } & {
    ref?: React.Ref<HTMLElement>;
  }
) => (<section ref={ref} {...props} />);
