import { Command } from 'cmdk';

export class P {
  #filter = (value: string, search: string) => (value.includes(search) ? 1 : 0);
  render() {
    return <Command filter={this.#filter === undefined ? undefined : (item, query) => { const score = (this.#filter as (value: string, search: string, keywords?: string[]) => number)(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score > 0 ? score : false; }} label="p" />;
  }
}
