import React from 'react';

type PanelProps = { open: boolean };

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(({ open }, ref) => (
  <div ref={ref} hidden={!open} />
));

export const Wide = React.forwardRef<HTMLElement, PanelProps & { extra: number }>((props, ref) => (
  <section ref={ref} {...props} />
));
