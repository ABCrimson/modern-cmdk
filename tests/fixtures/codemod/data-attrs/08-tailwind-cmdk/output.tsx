import { Command as CommandPrimitive } from 'cmdk';
import { cn } from './cn';

export function Item({ className }: { className?: string }) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'data-active:bg-accent data-disabled:opacity-50',
        className,
        `group-data-[selected=true]:text-white ${className}`,
      )}
    />
  );
}

export const Group = () => (
  <CommandPrimitive.Group className="[&_[data-command-group-heading]]:px-2 data-active:bg-muted" />
);

export const Odd = () => <CommandPrimitive.Item className="data-[selected=false]:opacity-100" />;
