---
"modern-cmdk": patch
---

The Options in the README on the npm page are a list instead of a table, so they read on a phone: the table's first column took most of a narrow screen and pushed "What it does" off the edge. Nothing about the package changes except that page.

**Changed**

- The Options of `createCommandMachine`, which are also props of `<Command>` and `<Command.Dialog>`, are one list item per option, with the same text as before. The `telemetry` item now says the hooks are called at the end of each batch, in place of "once per batch", which fit `onPaletteOpen` and `onSearchComplete` but not `onItemSelected`: it is called for each select in the batch.
