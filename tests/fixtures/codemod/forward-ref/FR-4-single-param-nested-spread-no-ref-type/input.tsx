import { forwardRef } from 'react';
const items = [{ id: 'a' }];
export const A = forwardRef((props: { id: string }) => <ul id={props.id}>{items.map((i) => <li key={i.id} {...i} />)}</ul>);
