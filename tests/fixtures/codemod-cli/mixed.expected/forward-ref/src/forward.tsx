export const Field = (
  {
    ref,
    value
  }
) => <input ref={ref} value={value} />;

export const Plain = (
  {
    ref,
    ...props
  }
) => <div ref={ref} {...props} />;
