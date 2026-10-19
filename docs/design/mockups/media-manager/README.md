# Media Manager mocks

The UI mocks for the Media Manager (#144), agreed scenario by scenario on 2026-10-17. The decisions
they led to are in [`../../2026-10-17-media-manager-design.md`](../../2026-10-17-media-manager-design.md).
Each page has a green Decided box at the top.

- [`batch-1.html`](batch-1.html): opening the manager, two windows and dragging between them,
  selections, Ctrl to copy.
- [`batch-2.html`](batch-2.html): cut, copy and paste, the OS clipboard, files from File Explorer,
  the Transfers window.
- [`batch-3.html`](batch-3.html): opening and editing an item, several selected, Create, a view per
  window.
- [`batch-4.html`](batch-4.html): the recycle bin, undo, refusals.
- [`explain-pane.html`](explain-pane.html): two batch 3 questions as pictures (the pink border on
  the open card, click versus Shift-click).

Everything right of the tree inside a window is drawn to match core's media collection as the
hosting spike rendered it, with thumbnails cut from the spike's screenshots. Every state is static
HTML, because the desktop app's side panel runs no scripts.

## Rebuilding

The pages are generated. `_build/kit.cjs` and `_build/kit.css` draw the desktop, windows, core's
collection and our additions at 1600 by 1000; `_build/batch-N.cjs` defines each batch's scenes.
From `_build`:

```bash
node batch-1.cjs
```

`_build/img/` holds the thumbnails and the wallpaper. They were cut from the spike's screenshots by
`_build/crop.html`, served by `_build/serve.py`, which saves what the page posts. The screenshots
themselves are not kept here; `crop.html` expects them in `_build/shots/`. sharp and puppeteer's
launcher did not load in this checkout, which is why the cropping runs in a browser.
