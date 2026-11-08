import { Command } from 'cmdk';

export const A = () => (
  <Command.Item className="group">
    <span className="group-data-[selected=true]:text-white peer-has-data-[disabled=true]:opacity-50 data-[selected=true]:font-bold" />
    <i className={`not-in-data-[selected=true]:hidden ${'x'}`} />
  </Command.Item>
);
