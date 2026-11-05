// The react import carries a comment.
/** The documented component. */
export const A = (
  {
    ref,
    id
  }
) => {
  // Render the item.
  return <li ref={ref} id={id} />; // trailing
};
