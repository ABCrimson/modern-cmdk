// The react import carries a comment.
import { forwardRef } from 'react';

/** The documented component. */
export const A = forwardRef(({ id }, ref) => {
  // Render the item.
  return <li ref={ref} id={id} />; // trailing
});
