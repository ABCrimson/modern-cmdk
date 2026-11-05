import { Command } from 'cmdk';

export class P {
  #filter = (value: string, search: string) => (value.includes(search) ? 1 : 0);
  render() {
    return <Command filter={this.#filter} label="p" />;
  }
}
