import { Command } from 'cmdk';

export const A = () => (
  <Command.Item className="group-data-[selected=true]:bg-accent peer-data-[disabled=true]:opacity-50 group-data-[selected=false]/row:underline md:peer-data-[selected=true]/menu:ring in-data-[disabled=true]:hidden data-[selected=true]:font-bold" />
);
