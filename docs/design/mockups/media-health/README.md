# Media Health mocks

The shapes the library-wide checks of #141 could take, drawn 2026-10-26 to decide whether cleanup
is an app, a part of the Media Manager, or both, and whether it builds on ProWorks MediaAudit.

- [`health.html`](health.html): seven scenes. The Media Health app at rest and while a check
  runs, View opening the Manager filtered to one category, the facts on folder cards and in the
  list view, Review one item at a time, the item's Usage box with Edit image's Save over warning,
  and Properties on a folder.

## Rebuilding

Generated from `_build/health.cjs` on the Media Manager kit in `../media-manager/_build`. From
`_build`:

```bash
node health.cjs
```
