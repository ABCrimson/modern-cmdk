import { forwardRef } from 'react';

export const A = forwardRef(([first], ref) => <div ref={ref} id={first} />);
export const B = forwardRef((...args) => <div {...args[0]} />);
export const C = forwardRef((props, { current }) => <div id={current} {...props} />);
export const D = forwardRef(({ ref: inner }, ref) => <div ref={ref} id={inner} />);
export const E = forwardRef((props, ref = null) => <div ref={ref} {...props} />);
