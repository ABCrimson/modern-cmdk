import { type Ref } from 'react';
export const B = (props: { id: string } & {
  ref?: Ref<unknown>;
}) => <div id={props.id} />;
