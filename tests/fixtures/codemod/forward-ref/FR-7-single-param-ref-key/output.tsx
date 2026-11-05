import { forwardRef } from 'react';
export const B = forwardRef<HTMLDivElement, { id: string }>(({ ref, id }) => <div id={id} />);
