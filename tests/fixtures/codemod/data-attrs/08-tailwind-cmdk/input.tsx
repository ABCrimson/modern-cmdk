import { Command as CommandPrimitive } from 'cmdk';
import { cn } from './cn';

export function Item({ className }: { className?: string }) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'data-[selected=true]:bg-accent data-[disabled=true]:opacity-50',
        className,
        `group-data-[selected=true]:text-white ${className}`,
      )}
    />
  );
}

export const Group = () => (
  <CommandPrimitive.Group className="[&_[cmdk-group-heading]]:px-2 data-[selected='true']:bg-muted" />
);

export const Odd = () => <CommandPrimitive.Item className="data-[selected=false]:opacity-100" />;
