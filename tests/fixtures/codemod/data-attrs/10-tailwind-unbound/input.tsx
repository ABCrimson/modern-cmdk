import { Command } from 'cmdk';
import { Other } from './other';

const classes = cn('data-[selected=true]:bg-accent');

export const A = () => <Other className="data-[selected=true]:bg-accent" />;
export const B = () => (
  <div className="data-[disabled=true]:opacity-50">
    <Command />
  </div>
);
