import { forwardRef } from "react";

export const A = forwardRef(({ id }, ref) => <div ref={ref} id={id} data-kind="a" />);

export const label = "forwardRef";
