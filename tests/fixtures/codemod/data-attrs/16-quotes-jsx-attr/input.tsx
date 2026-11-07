import { Command } from 'cmdk';

export const Row = () => (
  <Command.Item className="[&_[cmdk-group-heading]]:px-2 data-[selected=true]:bg-accent" cmdk-item="">
    {'label'}
  </Command.Item>
);
