import { Command as Palette, CommandDialog as Dlg, CommandRoot } from 'cmdk';

export const A = () => <Palette filter={false} label="a" />;
export const B = () => (
  <Palette.Dialog open filter={false} label="b">
    <Palette.Input />
  </Palette.Dialog>
);
export const C = () => <CommandRoot filter={false} label="c" />;
export const D = () => <Dlg open filter={false} label="d" />;
