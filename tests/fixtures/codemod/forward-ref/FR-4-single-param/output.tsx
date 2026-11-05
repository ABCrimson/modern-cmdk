import { type Ref } from 'react';

export const A = (props) => <div {...props} />;

export const B = (props: { id: string } & {
  ref?: Ref<HTMLDivElement>;
}) => <div id={props.id} />;

export const C = () => <div />;
