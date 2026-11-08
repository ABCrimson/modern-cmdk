// packages/modern-cmdk/src/react/separator.tsx
// <Command.Separator> — role="none" (presentational inside listbox)
// React 19: ref as prop (no forwardRef), use() for the state context
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { CommandStateContext } from './context.js';

export interface CommandSeparatorProps extends ComponentPropsWithRef<'div'> {
  /**
   * Render the separator while a search is active (cmdk's `alwaysRender`). With `false` it renders nothing
   * while the search is non-empty. The default is `true` in 1.x and flips to `false` in 2.0.
   */
  readonly alwaysRender?: boolean | undefined;
}

/** Visual divider between items or groups, rendered as a presentational element. */
export function CommandSeparator({
  ref,
  alwaysRender = true,
  ...props
}: CommandSeparatorProps): ReactNode {
  // `use` may run conditionally: the default reads no context, so a separator outside <Command> still renders
  if (!alwaysRender && use(CommandStateContext)?.state.search) return null;
  return <div ref={ref} data-command-separator="" role="none" {...props} />;
}
