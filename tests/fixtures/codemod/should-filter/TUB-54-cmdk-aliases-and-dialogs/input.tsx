import { Command as Palette, CommandDialog as Dlg, CommandRoot } from 'cmdk';

export const A = () => <Palette shouldFilter={false} label="a" />;
export const B = () => (
  <Palette.Dialog open shouldFilter={false} label="b">
    <Palette.Input />
  </Palette.Dialog>
);
export const C = () => <CommandRoot shouldFilter={false} label="c" />;
export const D = () => <Dlg open shouldFilter={false} label="d" />;
