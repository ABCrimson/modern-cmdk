---
"modern-cmdk-codemod": patch
---

Three `data-attrs` and discovery fixes: attribute names match case-insensitively, Tailwind `group-`, `peer-` and `in-` data variants are reported instead of guessed, and a submodule nested in a submodule no longer aborts a strict run.

**Bug fixes**

- DA-11: data-attrs matches attribute names case-insensitively: `[CMDK-ITEM]`, `[DATA-SELECTED="true"]`, a `CMDK-ROOT` JSX attribute and a bare `'CMDK-ITEM'` string are migrated as an HTML document would match them, and the rewrite writes the lowercase `data-command-*` name.
- DA-12: data-attrs reports `group-data-[selected=true]:`, `peer-data-[...]:` and `in-data-[...]:` variants on a cmdk-bound element instead of rewriting them to `group-data-active:`: they test the state of an ancestor or a sibling, which need not be a cmdk element. The element's own `data-[selected=true]:` is still rewritten. Migrate these by hand once you know which element carries the state.
- SEC-56: file discovery finds a submodule nested in a submodule and runs `git check-ignore` in the innermost repository, so a strict run over such a tree no longer throws `git check-ignore failed (exit 128)` ("Pathspec ... is in submodule ...").
