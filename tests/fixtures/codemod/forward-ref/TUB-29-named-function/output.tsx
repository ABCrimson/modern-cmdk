export const A = function Inner(
  {
    ref,
    ...props
  }
) {
  return <div ref={ref} {...props} />;
};

export default function Page(
  {
    ref,
    title
  }
) {
  return <h1 ref={ref}>{title}</h1>;
};
