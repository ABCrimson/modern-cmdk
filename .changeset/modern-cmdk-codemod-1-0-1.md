---
"modern-cmdk-codemod": patch
---

`data-attrs` and discovery fixes: attribute names match case-insensitively, Tailwind `group-`, `peer-` and `in-` data variants are reported instead of guessed (on cmdk elements and on any other element of a file that references cmdk), and a submodule nested in a submodule no longer aborts a strict run. The deprecated `modern-cmdk` bin (`dist/codemod`) is built from the same source and carries the three `data-attrs` fixes; SEC-56 does not apply to it, because that program applies no `.gitignore`.

**Bug fixes**

- DA-11: data-attrs matches attribute names case-insensitively: `[CMDK-ITEM]`, `[DATA-SELECTED="true"]`, a `CMDK-ROOT` JSX attribute and the Tailwind variant `data-[Selected=true]:` are migrated as an HTML document would match them, and the rewrite writes the lowercase `data-command-*` name, also in a file whose only cmdk reference is upper-case; a `CMDK-LABEL` attribute, a `data-[DISABLED]:` variant and a bare `'CMDK-ITEM'` string are reported, as their lowercase forms are.
- DA-12: data-attrs reports `group-data-[selected=true]:`, `peer-data-[...]:`, `in-data-[...]:` variants, their `-has-` forms (`peer-has-data-[...]:`) and their `not-` forms (`not-in-data-[...]:`) on a cmdk-bound element instead of rewriting them to `group-data-active:`: they test the state of an ancestor or a sibling, which need not be a cmdk element. The element's own `data-[selected=true]:` and a bare `has-data-[selected=true]:` are still rewritten. Migrate the reported ones by hand once you know which element carries the state.
- DA-13: data-attrs reports the same other-element data variants in the class lists of elements that are not cmdk-bound, in a file that references cmdk (`<span className="group-data-[selected=true]:text-white">` under a `Command.Item`): they stop working once the item renders `data-active` instead of `data-selected="true"`, and were reported nowhere. Nothing is rewritten.
- SEC-56: file discovery finds a submodule nested in a submodule and runs `git check-ignore` in the innermost repository, so a strict run over such a tree no longer throws `git check-ignore failed (exit 128)` ("Pathspec ... is in submodule ...").
