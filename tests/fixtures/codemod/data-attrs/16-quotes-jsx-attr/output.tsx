import { Command } from 'cmdk';

export const Row = () => (
  <Command.Item className="[&_[data-command-group-heading]]:px-2 data-active:bg-accent" data-command-item="">
    {'label'}
  </Command.Item>
);
