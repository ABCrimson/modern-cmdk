export const Field = (
  {
    ref: inputRef,
    value,
    ...rest
  }
) => (<input ref={inputRef} value={value} {...rest} />);
