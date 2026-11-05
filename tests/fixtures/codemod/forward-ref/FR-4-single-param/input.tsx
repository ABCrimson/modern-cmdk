import { forwardRef } from 'react';

export const A = forwardRef((props) => <div {...props} />);

export const B = forwardRef<HTMLDivElement, { id: string }>((props) => <div id={props.id} />);

export const C = forwardRef(() => <div />);
