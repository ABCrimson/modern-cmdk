import { Command } from 'cmdk';

export const A = () => (
  <Command.Item className="group-data-[selected=true]:bg-accent peer-data-[disabled=true]:opacity-50 group-data-[selected=false]/row:underline md:peer-data-[selected=true]/menu:ring in-data-[disabled=true]:hidden peer-has-data-[selected=true]:ring-2 not-in-data-[selected=true]:hidden has-data-active:border data-active:font-bold" />
);
