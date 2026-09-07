# Unsaved changes guard — Design

> A window whose content has unsaved changes marks itself in its titlebar, and the three ways out
> of that window — closing it, reloading it, and exiting the desktop — each ask before throwing the
> work away, in the same words the backoffice already uses. A window with nothing editable in it
> never marks and never asks.

- **Status:** Implemented and verified in a browser (2026-09-07)
- **Date:** 2026-09-07
- **Branch:** `claude/umbradesktop-issue-20-570f37`
- **Issue:** [#20](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/20)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

The classic backoffice guards unsaved work: leave a workspace with pending changes and it asks
whether to discard them. The desktop added ways out of a workspace that Umbraco's own guard never
sees, because none of them is a route change in the frame's router.

**In scope** — the two scenarios that lose work, plus the third route the same guard covers for
free:

- **Closing a window.** The close button discards the frame's edits with no warning.
- **Exiting the desktop.** The launcher footer's Exit unmounts the desktop with every open window
  in it, so it can discard several windows' work at once.
- **Reloading a window.** The titlebar reload button re-fetches the frame in place, discarding
  edits exactly as closing does. It is the same question and one call to the same guard.
- A titlebar marker while a window is unsaved, so an editor can tell a typed-in window from an
  untouched one, and so "2 windows have unsaved changes" is answerable.

**Out of scope**

- Saving on the user's behalf, from any of the three routes. The choice stays discard or stay.
- The browser's own tab close / refresh. Each frame already runs core's `beforeunload` handler, so
  the browser asks; the desktop adds nothing.
- Leaving the Desktop section by any route other than Exit (back button, a header-app click). Those
  are section navigations in the outer document, not desktop affordances, and are their own issue.
- Any per-window "save all" affordance, or marking on the taskbar button. Considered and dropped;
  see §8.

---

## 2. Settled decisions

- **D1 — A dot in the titlebar, after the title text.** The window *is* the document here, so its
  titlebar is the tab equivalent, and marking it is what VS Code, Notepad on Windows 11 and Word all
  do. macOS puts the same signal in the close button and iWork puts "Edited" in the title; both were
  rejected in §8.
- **D2 — Core's `UMB_DISCARD_CHANGES_MODAL` for close and reload.** Reusing the token is what makes
  the wording *the same wording*, rather than a copy of it that drifts. It is the token
  `entity-detail-workspace-base` opens for its own navigate-away guard.
- **D3 — Exit asks once, in its existing dialog.** Exit already confirms ("Exit desktop mode").
  Stacking a discard dialog on top of it would ask twice for one decision, so the unsaved count
  becomes a sentence in the dialog that is already there.
- **D4 — The guard lives on `window-manager.context`, not on `window.element`.** The element owns
  one window; Exit acts on the whole set. Both need the same answer.
- **D5 — The desktop computes dirtiness itself rather than calling
  `getHasUnpersistedChanges()`.** Forced by §3.1. It uses core's own exported comparison over the
  workspace context's own public observables, so the answer is identical and silent.
- **D6 — A window with no dirty-capable workspace context is simply never dirty.** Not a list of
  exempt apps, not a chrome-profile rule: Log Viewer and every dashboard provide no workspace
  context that carries persisted and current data, so they fall out of the mechanism with nothing
  written about them. That is what makes the "never asks, quietly, and produces no console errors"
  criterion structural instead of a special case waiting to rot.

---

## 3. What the state actually is

`UMB_SUBMITTABLE_WORKSPACE_CONTEXT` (alias `UmbWorkspaceContext`) is the context every workspace
provides. On `UmbEntityDetailWorkspaceContextBase` — which every editable workspace the desktop can
open derives from, documents and media included — three members matter:

| Member | Shape | What it is |
| --- | --- | --- |
| `data` | `Observable<Model \| undefined>` | the workspace's **current** data, i.e. what the editor has in it |
| `persistedData` | `Observable<Model \| undefined>` | the data **as last saved** |
| `getHasUnpersistedChanges()` | `(): boolean` | core's own dirty check over those two |

### 3.1 Why `getHasUnpersistedChanges()` cannot be the signal

It looks like exactly the right method, and the issue names it. It is not usable as a *watched*
signal, for two reasons that are both in its body:

```js
getHasUnpersistedChanges() {
  const persisted = this._persisted.getValue();
  const current = this._current.getValue();
  const result = jsonStringComparison(persisted, current) === false;
  // TODO: Implement developer-mode
  if (result) {
    console.warn('Changes detected based on JSON comparison between', persisted, 'and', current);
  }
  return result;
}
```

- It **logs on every call that finds changes.** Core gets away with it because it only calls the
  method on navigate-away and `beforeunload` — once per decision. Anything that watches dirtiness
  calls it per change or per tick, and every one of those calls writes a warning to the console. A
  minute of typing would bury the console.
- It **stringifies the whole document each call**, which is fine once and wasteful on a timer.

So there is no polling design here, and no design that calls this method per keystroke either. What
there is instead: subscribe to `data` and `persistedData`, and on either emission run
`jsonStringComparison(persisted, current) === false` ourselves. `jsonStringComparison` is exported
from `@umbraco-cms/backoffice/observable-api` and is the same function core calls, so this is core's
comparison with core's semantics — just without the warning and without being asked when nothing
changed.

The two observables are `_current` and `_persisted` themselves, and `_current` is already sorted at
set time by the data manager, so no ordering step is being skipped.

---

## 4. Reaching the context from the shell

A window's content is a same-origin iframe, so the shell can touch it — `chrome-injector.ts` is the
precedent. Consuming a context inside it is harder than injecting CSS into it, and for one specific
reason worth writing down.

**The context request event bubbles up.** `UmbContextConsumer` dispatches
`umb:context-request` on its host element and lets it rise until a provider answers. So a probe
element attached at the iframe's `document.body` is an *ancestor* of the workspace element and its
request rises away from the provider, never to it. A window hosting a whole section has its dirty
workspace nested well below the frame root, which is exactly the case that breaks.

### 4.1 The provide event as the way in

`UmbContextProvider.hostConnected()` dispatches `umb:context-provide` on the element it is provided
from, with `bubbles: true, composed: true`. That reaches the iframe's document. So:

1. Listen on the iframe document for `umb:context-provide`. When `contextAlias` is
   `UmbWorkspaceContext`, `event.composedPath()[0]` is the provider's own element.
2. Dispatch a context request **on that element**. `UmbContextProvider` registers its request
   listener on the same element, so the request is answered without needing to rise anywhere.
3. Listen for `umb:context-unprovided`, which carries `instance`, and untrack on an exact match.

Two things make step 2 cheap. The provider reads only `contextAlias`, `apiAlias` and `callback` off
the event and never checks its class, so a plain `Event` with those three properties set is enough —
no cross-realm `instanceof` problem, and no need to construct core's event class inside the frame's
realm. And the alias and the discriminator both come off the imported token
(`UMB_SUBMITTABLE_WORKSPACE_CONTEXT.toString()`, `.getDiscriminator?.()`) rather than being written
out, so a rename in core is a compile-time break here rather than a silent no-op.

The event fires again on every in-window navigation, which is what makes opening a second document
in the same window work with no extra machinery.

### 4.2 The one timing risk

A provide event that fired before the listener attached would be missed, and that window would never
mark. The listener attaches on the iframe's `load`, beside chrome injection.

`chrome-injector.ts` already settles this, and it is worth reading before doubting it. That module
runs at the same moment, and it does **not** find `<umb-backoffice-header>` in the frame — it polls
for up to ten seconds waiting for the shell to mount. So at `load`, the backoffice has not rendered
its own header yet, and the header mounts before any section, which mounts before any workspace. A
provide event cannot have fired.

It is still an ordering fact about someone else's boot sequence rather than a guarantee, so it was
smoke-tested against a real instance on 2026-09-07: a content window marked on the first keystroke,
so the provide event does arrive after the listener attaches. If it ever did become reachable, the
fallback is a shadow-root walk for a mounted workspace element at attach time (rejected below as the
primary mechanism, acceptable as a one-shot).

### 4.3 Rejected alternatives

- **Walk shadow roots for a known workspace element and probe from there.** No timing risk, but it
  hardcodes core's element tags; when they change it fails silently, which is the worst failure mode
  for a guard whose whole job is to not be silent.
- **Inject a real `UmbContextConsumer` into the frame.** Cleanest on paper, but it needs a host
  element that is a descendant of the provider — the same problem as above — plus a controller host
  inside the frame to own its lifecycle.
- **Poll the frame's DOM for core's own dirty indicator.** Rejected in the issue, and rightly: it
  reads a rendering of the state instead of the state.

---

## 5. Components

Four new pieces and four edited ones. Each new piece has one job.

### 5.1 `desktop/dirty-watcher.ts` (new)

```ts
watchFrameDirtyState(iframe: HTMLIFrameElement, onChange: (dirty: boolean) => void): () => void
```

One watcher per window, started from the window element's iframe `load` handler and stopped on
disconnect. Owns: the two document listeners from §4.1, the set of tracked contexts, their
observable subscriptions, and the derived boolean. Calls `onChange` only when the boolean actually
flips, so a keystroke in an already-dirty window costs one comparison and no re-render.

A tracked context is one that satisfies the token's discriminator **and** exposes `data` and
`persistedData` as subscribable. Everything else is ignored, which is D6.

### 5.2 `window-model.ts` (edited)

`setWindowDirty(windows, id, dirty)` and `unsavedWindows(windows)`, in the same pure style as their
neighbours. `unsavedWindows` returns the windows rather than a count, because the Exit message needs
a count today and the honest thing to hand a future "which ones?" is the list.

### 5.3 `types.ts` (edited)

`dirty?: boolean` on `UmbraDesktopWindow`. Optional, so a window is clean until something says
otherwise and no existing construction site changes.

### 5.4 `window-manager.context.ts` (edited)

```ts
setDirty(id: string, dirty: boolean): void        // the watcher's destination
confirmDiscard(id: string): Promise<boolean>      // true = may be discarded
requestClose(id: string): Promise<void>           // confirmDiscard, then close
unsavedWindows(): ReadonlyArray<UmbraDesktopWindow>
```

`confirmDiscard` returns `true` immediately for a clean window, and otherwise resolves the result of
`umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL)` — resolve is *discard*, reject is *stay*. The
context is a `UmbContextBase`, hence a controller host, hence a valid modal origin; its own host is
the desktop element, which lives as long as the desktop.

### 5.5 `window.element.ts` (edited)

- The close button calls `requestClose` instead of `close`.
- The reload handler awaits `confirmDiscard` and returns untouched on refusal. It also has a second
  caller — `#applyFrameTheme` reloads a frame when a theme's CSS is a loader function rather than a
  link. That path must **not** ask: it is a display preference the user did not aim at this window,
  and the existing comment there already says reloading would cost them anything unsaved. So the
  confirm goes on the button's handler, not inside `#onReload`.
- Starts and stops the watcher, and renders the marker.

### 5.6 `taskbar.element.ts` (edited)

`#onExit` reads `unsavedWindows()` and, when it is non-empty, adds a sentence to the dialog it
already opens. One dialog, per D3.

---

## 6. The marker

A `<span class="dirty">` after the title text inside `.title`, carrying a localized
`title`/`aria-label` so it is not a decoration that only sighted users can read.

Two tokens, both added to `UMBRADESKTOP_TOKENS` and to the `docs/theming.md` table:

| Token | Default | Why it has one |
| --- | --- | --- |
| `--umbradesktop-titlebar-dirty-color` | `var(--umbradesktop-titlebar-text, …)` | Chaining to the titlebar's own text colour is what makes the dot visible in all five themes with no theme touching it — Win98's white-on-navy caption and macOS's dark-on-light both come out right by construction. |
| `--umbradesktop-titlebar-dirty-size` | a px literal in the base CSS | So Win98 can square it and a large-caption theme can scale it. |

Deliberately *not* an alarm colour. The dot states a fact about the document; the dialog is where
the consequence lives. An always-on red dot in every titlebar you have edited reads as an error.

Per the repo's standing rule, a theme may restyle it and may not remove it, and §7 tests that.

---

## 7. Tests, written first

| What | Where | How |
| --- | --- | --- |
| `setWindowDirty` / `unsavedWindows` | `window-model.test.ts` | pure, alongside the existing model tests |
| Watcher: provide → tracked, edit → dirty, save → clean, unprovide → clean | `dirty-watcher.test.ts` | a hand-built fake provider element in the test document, mirroring how `chrome-injector.test.ts` builds fake shadow trees. Proves the §4.1 mechanism against the real contract, not against core's boot |
| Watcher ignores a context with no `data`/`persistedData` | same | this is the Log Viewer criterion, and it is testable without Log Viewer |
| `confirmDiscard` passes a clean window, gates a dirty one, and `requestClose` respects both | `window-manager.test.ts` | via a seam on the manager, so the test needs no modal manager context |
| Marker renders when dirty and not when clean | `window-dirty.test.ts` | the base window, mounted as the existing component tests do |
| Marker is visible under `umbraco4`, `win11`, `win98` | the three existing themed `window.test.ts` files, via `measureUnsavedMarker` in `themes/mount-themed.ts` | reusing the mount each already has. `mount-themed.ts` documents that mounting extra chrome components in one page is intermittently very slow and was a source of random timeouts, so this adds assertions rather than mounts |
| No theme removes, starves or hides the marker | `theme/unsaved-marker.test.ts`, over `UMBRADESKTOP_THEMES` | CSS-text check. This is what covers macOS and Umbraco, neither of which has a themed window mount, and it is the general form of the restyle-never-remove rule |

The browser check from §4.2 is part of done, not part of the suite: open a content window, type,
confirm the dot appears and the three dialogs behave, and open a Log Viewer window and confirm a
clean console.

---

## 8. Considered and dropped

- **A dot in the close button (macOS's own idiom).** Elegant under one theme, hidden behind a hover
  under the other four, and it puts the warning on the very control that triggers the loss.
- **An asterisk prefix on the title.** Free, but easy to miss and unstylable beyond the title
  colour, so a theme could not adapt it.
- **No marker at all, warn on close only.** Considered seriously. It fails the moment Exit says "2
  windows have unsaved changes" and the editor has no way to find which two — and it fails again
  after they cancel.
- **Marking the taskbar button instead.** Closer to where Windows and macOS put it *now*, but the
  taskbar button is how you reach a window, not how you read its state, and a minimized window's
  marker then lives somewhere different from a visible one's.
- **Naming the unsaved windows in the Exit dialog rather than counting them.** Better answer to
  "which ones?", but with the marker in place the desktop behind the dialog already answers it, and
  a list of eight window names is a worse dialog than a count.
- **Offering Save in any of the dialogs.** The desktop cannot know whether a workspace's save would
  succeed (validation, permissions, publish scheduling), and a Save button that fails inside a
  dialog that is about to close the window is worse than no Save button.

---

## 9. Definition of done

- `npm run build` and `npm test` both pass.
- `README.md` names the guard in the Features list and in the windows section.
- `umbraco-marketplace.json` names it in `Description` and `Tags` — it is a reason to choose the
  package, and a data-loss guard missing from the summary is a feature nobody knows exists.
- `docs/theming.md` gains both tokens in its table.
- This document records the `getHasUnpersistedChanges()` finding (§3.1) and the provide-event
  technique (§4), which are the two things the next person cannot read off the code.
- The §4.2 timing assumption is verified in a browser, and the result written down here. **Done**
  on 2026-09-07: marker appears and clears, all three dialogs behave, cancelling each one leaves the
  work where it was, and Log Viewer neither marks nor asks nor logs.

## 10. Notes from the build

- **The Exit dialog was hardcoded English** while the launcher around it was localized. Adding a
  localized unsaved sentence to it would have produced a half-Dutch dialog, so its four existing
  strings were localized in the same change. That is the only widening of scope here, and it exists
  because the alternative was to make one file worse.
- **`#onReload` has two callers and only one of them may ask.** The confirm lives on
  `#onReloadClick`, the button's handler. `#applyFrameTheme` still calls `#onReload` directly when a
  theme's CSS is a loader function; putting the guard inside `#onReload` would have made a backoffice
  theme change interrogate every dirty window on the desktop.
- **`setWindowDirty` returns the same array when nothing changed.** Not an optimisation: the watcher
  re-reports on every emission from the frame, so an already-dirty window reports dirty on every
  keystroke, and a new array each time would re-render every window on the desktop per character.
- **A workspace with either half still `undefined` counts as clean.** Core loads a workspace by
  setting the persisted half and the current half in separate calls, so anything comparing them
  between those two calls sees a difference that does not exist. The rule that a workspace which has
  not loaded cannot have unsaved work removes that flicker without a debounce.
