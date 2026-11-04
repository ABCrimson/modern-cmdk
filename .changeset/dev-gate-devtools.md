---
'modern-cmdk': patch
---

`useCommandDevtools` no longer throws `ReferenceError: __DEV__ is not defined` in published builds. Development-only code (the devtools bridge and the search-engine leak detector) is now gated on `process.env.NODE_ENV`, with a safe production fallback when no bundler replaces it; the leak detector stays off during SSR.
