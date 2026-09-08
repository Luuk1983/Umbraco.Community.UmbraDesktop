# Overwrite guard — Design

> The backoffice lets two editors overwrite each other silently. Umbraco has the signal and uses it
> only to drop cached copies, so the platform knows and does not say. This is the desktop saying it:
> a window notices when its own document changed on the server, and refuses to let its editor save
> over somebody else without knowing. Nothing here needs AI, and the same mechanism generalises to
> a window telling its editor anything else that is wrong.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-09-08
- **Branch:** `feature/35_overwrite_guard`
- **Issue:** [#35](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/35)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`
- **Supersedes:** §7 of
  [the Umbraco AI design](2026-09-08-umbraco-ai-on-the-desktop-design.md) on three points of fact,
  recorded in §6 and §4 below
- **Builds on:** [the unsaved changes guard](2026-09-07-unsaved-changes-guard-design.md), whose
  dirty watcher, marker and guards are all extended rather than replaced

---

## 1. Goal & scope

Open a page in two browsers, edit both, save both. The second save wins, silently. Nobody is told,
nothing is flagged, and the first editor's work is gone with no trace in the UI. Umbraco receives
live change notifications over SignalR and the whole backoffice does one thing with them,
`this._dataCache.delete(event.key)`, so the next load is fresh. No open editor is refreshed and
nobody typing into one is warned.

The desktop makes that risk larger, because several documents are open at once and one of them can
sit minimized for an hour while somebody else works on it. So this is the desktop paying for the
risk it introduces, and in doing so becoming the only surface in Umbraco that warns an editor at
all.

**In scope.** A window notices when its subject changed, was trashed or was deleted on the server.
It refreshes itself when that is safe, and when it is not it says so in its own chrome, on its
taskbar button and in every dialog that could throw the work away.

**Out of scope for this branch.** Showing *what* changed. It is designed in §10 and it is a nice to
have rather than a requirement, so phase 1 ships complete without it.

**Not in this feature at all.** Anything AI. Keeping two views of one conversation in step, which
the available events cannot support.

---

## 2. Settled decisions

- **D1 — Three severities, not a special case.** A window carries a list of notices, each `info`,
  `warning` or `error`. Severity decides loudness and nothing else decides it. Today's unsaved dot
  becomes an `info` notice, so its behaviour is unchanged, and the conflict work adds two levels
  above it rather than a parallel mechanism beside it.
- **D2 — Notices compose.** A document can be in the recycle bin *and* have been edited by someone
  else *and* hold unsaved changes. Each fact is its own notice with its own wording and its own
  actions, and the window's marker shows the worst severity present. The alternative, one banner
  leading with the worst fact and naming the rest in a second line, needs bespoke wording for every
  combination of facts and gets no simpler as facts are added.
- **D3 — `info` renders as the marker only.** A banner on every window with unsaved changes would be
  intolerable, and it is also what keeps #20's behaviour byte for byte.
- **D4 — The taskbar carries all three, and shape says which.** `info` is a dot, `warning` and
  `error` are the glyph. This started as "the taskbar carries `warning` and `error`, never `info`",
  on #20's reasoning that the editor caused the unsaved state and knows about it while nobody causes
  the others. That reasoning is sound about *blame* and wrong about *visibility*, which is what the
  taskbar is for: a window minimized an hour ago is exactly the one whose unsaved work you have
  stopped thinking about, and the argument that put a conflict on the taskbar puts a dot there too.
  A dot and not a third glyph, because every window being edited is dirty: a glyph on all of them
  spends the scarcity that makes a glyph mean "look at this", and a dot is what macOS, VS Code and
  every other editor use for unsaved work. One marker per button, always the worst one, as in the
  titlebar.
- **D5 — Ask the server, do not enumerate local writes.** A window decides whether an event is its
  own write by fetching the server's copy and comparing, not by recognising the paths through which
  it can write. See §5, and R1 for what this rejects.
- **D6 — Banners, never a blocking sheet, including for a deleted document.** A window hosts a whole
  backoffice document, so covering its body blocks a legitimate escape route: the frame can still
  navigate somewhere else. It also stops the editor reading and copying their own unsaved text,
  which for a permanently deleted node is the only thing left to do with it.
- **D7 — A clean window refreshes silently.** In place, via the workspace context's own `reload()`,
  with the titlebar reload glyph spinning while it happens. Desktop applications update while you
  read them and do not announce it, and a notice nobody can act on is one people learn to dismiss
  unread.
- **D8 — Trashed is a third state and it does not alarm a clean window.** Only permanent deletion
  does, because it is the one state with nothing to refresh to. See §4.
- **D9 — `info` keeps the `.dirty` selector.** All five themes style it, `unsaved-marker.test.ts`
  keys off it, and `docs/theming.md` documents it for readers outside this repository, so the one
  state whose appearance must not change keeps the class it has and the `info` tokens chain to the
  existing ones. `warning` and `error` are a *different element* in the same slot, `.notice-marker`,
  because they are no longer a dot: see §8.1. Amended after the feature was seen running — the first
  version put all three on `.dirty` with a modifier class.
- **D10 — Acknowledging is gated by a confirmation and quiets one surface only.** "Keep my changes"
  opens a dialog stating that saving will lose the other editor's change. Confirming removes that
  notice's banner and leaves the marker and the taskbar badge, so the window never goes back to
  looking safe.
- **D11 — Save is not intercepted.** It lives inside the frame and cannot be. D10's dialog is where
  that warning is delivered.

---

## 3. The state model

Four facts a window can hold, in severity order. The table says how a notice is expressed once it is
raised; when each one is raised is the list below it.

| Fact | Severity | Marker | Banner | Taskbar | Actions on its notice |
| --- | --- | --- | --- | --- | --- |
| Permanently deleted | `error` | yes | yes | yes | none, it is a statement of fact (phase 2: show my unsaved changes) |
| Moved to the recycle bin | `error` | yes | yes | yes | none, it is a statement of fact |
| Changed by someone else | `warning` | yes | yes | yes | Keep my changes, discard mine and load theirs |
| Unsaved changes | `info` | yes | no | no | none |

Two pure functions carry all of it, and both are testable with nothing rendered:

```ts
windowNotices(window): UmbraDesktopNotice[]   // sorted error, warning, info
worstSeverity(notices): UmbraDesktopNoticeSeverity | undefined
```

The composition cases worth stating, because they are the ones that go wrong:

- Trashed and clean: no notice beyond the refresh. `reload()` runs and Umbraco's own UI shows the
  bin state.
- Trashed and dirty: one `error`. The window still looks editable, because its own data has not
  reloaded to say otherwise, but core's read-only guard bites the moment it does, so the changes have
  nowhere to go unless somebody restores the item first, and the wording says exactly that. It was a
  `warning` in the first cut, on the reasoning that the bin is undoable — corrected once the feature
  could be used: undoing it is somebody else's action, and from where the editor sits their work has
  nowhere to go, which is the same fact `deleted` states. A `warning` says "this could go badly",
  which is true of a conflict, where you still choose whose version wins, and untrue here.
- Trashed and dirty and changed by someone else: an `error` and a `warning`, two banners, one
  marker, the bin's first.
- Deleted and clean: one `error`. The only state that marks a clean window.
- Deleted and dirty: one `error`. No discard action, because there is no version to load, and no
  close action either. It had one, and it went: a window whose document is gone still works — its
  tree is live and navigating to another node is what most people will do — so the only button on
  the banner was the one that threw the window away, presented as the way out of the situation.
  Neither `error` offers anything now, which also means the two read the same way; offering an
  action on one and not the other made the pair look inconsistent for no reason an editor could see.

---

## 4. The signal

`UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` is a `globalContext`, so there is one per backoffice
document. The desktop consumes it **once, in its own document**, not per frame. Every window is a
backoffice document and already opens its own hub connection; that count is a separate issue and
this design does not add to it.

The payload is four fields and no more:

```ts
{ eventSource: string; eventType: string; key: string; clientTimestamp: string }
```

`clientTimestamp` is stamped by the client on receipt, not by the server, so it dates the delivery
and not the change. Nothing in the payload identifies the user or the client. That is the trap this
whole design is built around, and §5 is the answer to it.

**Three event types, not two.** The AI design's §7.2 names `Updated` and `Deleted`. Core's document
and media cache invalidation managers ask for `['Updated', 'Deleted', 'Trashed']`, and the
difference matters more than the omission suggests:

- `Trashed` is what the backoffice's Delete actually does. It moves the node to the recycle bin, so
  the node still exists and `loadWithoutPersist()` succeeds. But core's document workspace context
  reacts to `isTrashed` on its own data by adding a read-only guard, `UMB_PREVENT_EDIT_TRASHED_ITEM`,
  and removes it only once the item is untrashed, so a trashed document cannot be saved. The catch
  is that `isTrashed` is read from the workspace's *current* data: a window holding unsaved changes
  has not reloaded, so it still reports `isTrashed: false` and still looks fully editable, Save
  button included, until the moment it does reload, when the guard takes hold and the button stops
  working.
- `Deleted` is permanent removal, such as emptying the bin. `submit()` branches on `getIsNew()`,
  which is false for a loaded document, so it always takes the `PUT` path and receives a 404. It
  never tries the create endpoint, so **saving fails and recreates nothing**.

Wiring only `Deleted` would therefore miss the case editors actually cause and would show the
dead end almost never.

This fact lives only in core's workspace context: it is in neither the management API nor the
event payload, and it surfaced only once the feature was run in a browser rather than read off
core's types.

**Matching.** On the event's `key` against each window's subject. Umbraco keys are GUIDs and
globally unique, so the key alone would be a sound match on its own.

`eventSource` is nevertheless a **gate** in phase 1, admitting `Umbraco:CMS:Document` and
`Umbraco:CMS:Media` and nothing else. That is narrower than an earlier draft of this section
claimed, and it is a scope decision rather than a technical one: core emits nineteen sources,
including `DocumentType`, `Member`, `DataType` and `Template`, so two developers editing one
document type today get no warning. Widening it is a matter of deleting two entries from one array,
and the reason not to do it yet is that none of those workspaces has been through the browser pass
in §11, and a warning that misfires on a data type would cost the feature the credibility §5 exists
to protect. It also leaves `value-compare.ts`'s non-content fallback path tested but unreachable in
production, since document and media models always carry `values` and `variants`; that path is
waiting for the same widening rather than being dead.

**Where the subject comes from.** The same place the dirty state does. `dirty-watcher.ts` already
holds the workspace instances it compares, and `unique`, `entityType`, `reload()` and
`loadWithoutPersist()` are all public on `UmbEntityDetailWorkspaceContextBase`. Its callback widens
from `(dirty: boolean)` to a record carrying the dirty answer and the tracked subjects together.
One listener, not two, and `hasUnsavedChanges` and its tests are untouched.

---

## 5. Deciding whether it is a conflict

### 5.1 The trap

The event carries no identity, so your own save arrives as an `Updated` event for your own key,
indistinguishable from a colleague's. It does not resolve by luck. The window goes clean as it
saves, but "this window is clean now" comes from the frame's HTTP response while "the server says
this changed" comes from the shell's SignalR connection, and there is no ordering between them.
There is a real window in which the shell sees dirty plus changed at the moment somebody pressed
Save and everything went fine. That false positive would teach people to ignore the alarm inside a
day.

### 5.2 Why recognising local writes does not work

The obvious fix is for a window to know when it is writing. It fails on the most common editor
action there is:

- `saveAndPublish`, `schedule` and `unpublish` call `performCreateOrUpdate` on the document
  workspace directly. They never go through `requestSubmit()` or `submit()`.
- None of them dispatch `UmbEntityUpdatedEvent`. They dispatch
  `UmbRequestReloadStructureForEntityEvent` only.

So a window that watched the submit path would alarm itself every time its editor published. The
write surface is an open set and core may extend it in a minor version, where a new path shows up as
a false alarm on a real action rather than as a build failure.

### 5.3 Ask the server instead

A `Deleted` event needs no classification: there is nothing to fetch and nothing to compare, so it
raises `error` directly. A clean window needs no classification either, because `mine` equals `base`
by definition, so its treatment is `reload()` and that request is the refresh rather than a check.

Everything else is one fetch and one pure function. `loadWithoutPersist()` returns the server's copy
without touching the editor, and the decision is made from three snapshots: `base` is the window's
last saved data, `mine` is its current data, `theirs` is the server's.

| Result | Condition | Treatment |
| --- | --- | --- |
| own write | `theirs` equals `mine` | nothing, whichever path wrote it |
| no change | `theirs` equals `base` | nothing, a duplicate or stale event |
| conflict | differs from both | `warning` notice |
| gone | the fetch 404s | `error` notice, the node went while we were asking |

No timers, no identity, no core internals. It covers save, publish, schedule, unpublish, an entity
action, and the same person saving from another browser tab, because it never tries to enumerate
them.

**Equality is at the level of values you could have written.** `theirs` is the server's response,
which carries fields the editor never had, such as `updateDate` and version identifiers. A literal
deep comparison would find your own save unequal to itself and alarm on it, which is exactly the
failure this section exists to prevent. The comparison is over property values keyed by alias,
culture and segment, plus variant names, and ignores server-managed metadata. That comparison is the
first thing built and the first thing tested.

### 5.4 Cost

Bounded, and it lands where the risk is.

- A window whose subject does not match does a string compare and nothing else.
- A clean matching window spends the one GET that `reload()` was always going to spend.
- Only a dirty window on the changed node pays for a classification fetch.

Twelve windows open, three of them content editors with unsaved work on different nodes, a colleague
publishing one of those nodes: one GET. Publishing a node no window has open: zero. Bursts, from
publish with descendants or a bulk move, are coalesced per window, so a burst for one node is one
fetch, and a window never has more than one fetch in flight.

---

## 6. What Umbraco's save actually sends

The AI design's §7.6 records that two editors on different cultures of one document is "the single
most likely way to hit this state in practice, and also the most likely to be harmless", and
suggests that recognising the case may be worth more than a diff. **That is wrong, and the truth is
the reverse.**

`UmbEntityWorkspaceDataManager.constructData(selectedVariants)` hands the work to
`UmbMergeContentVariantDataController.process(persistedData, currentData, selectedVariants,
variantsToStore)`. For a value whose variant is not in `variantsToStore`, `#processValues` returns
the **persisted** value, meaning the copy loaded into your window when you opened it. Those values
go into the payload.

So saving the English variant asserts your stale German values. A colleague's German edit, made
after you loaded the page, is reverted by your English save. Both editors believed they were working
in separate compartments, which makes it the least suspected form of the bug rather than the most
harmless.

Consequences for this design:

- There is no harmless variant exemption to build. A variant scoped change alarms like any other.
- Culture and segment are still part of a value's identity in §5.3's comparison, and in phase 2 the
  culture is what tells the editor which change collided. It is not a reason to suppress.
- This is a core data loss path independent of the desktop, and it is worth reporting upstream. See
  §14.

---

## 7. Components

### 7.1 `desktop/notices/` (new)

- `types.ts` — `UmbraDesktopNoticeSeverity`, `UmbraDesktopNotice { id, severity, title, body,
  actions }`.
- `notices.ts` — `windowNotices()` and `worstSeverity()` from §3. Pure, and the single source for
  every surface.

### 7.2 `desktop/conflict/` (new)

- `classify.ts` — §5.3's decision, pure over three snapshots.
- `value-compare.ts` — the value level equality of §5.3, including which fields are server managed.
- `server-event.watcher.ts` — the shell side controller. Consumes the server event context in the
  desktop's document, filters source and type, matches keys against window subjects, coalesces,
  orchestrates fetch and classify, and writes the result through the manager.

### 7.3 `dirty-watcher.ts` (edited)

The callback widens to report subjects alongside the dirty answer, as §4 describes. Everything about
how it reaches into the frame, and why it listens for `umb:context-provide` rather than asking, is
unchanged and its existing documentation still governs.

### 7.4 `types.ts` and `window-model.ts` (edited)

`UmbraDesktopWindow` gains `changedElsewhere`, `trashed`, `deleted` and `acknowledged`, each optional
and absent rather than false on a fresh window, exactly as `dirty` already is. Each gets a setter
with `setWindowDirty`'s identity shortcut, which is load bearing rather than an optimisation: a new
array per event would re-render every window on the desktop.

### 7.5 `window-manager.context.ts` (edited)

`setServerState`, `acknowledge`, and the guard changes of §9. Reads `windowNotices` rather than
inspecting flags itself.

### 7.6 `components/window-notices.element.ts` (new)

The banner stack, between the titlebar and the body, in the desktop's document. Capped with its own
scroll so three notices on a short window scroll rather than pushing the titlebar off, and notices
never change the window's rect, which for a maximized window is not an option anyway.

### 7.7 `components/window.element.ts` (edited)

Renders the stack, adds the severity modifier to the marker, and gains `_refreshing`. That is a
separate state from `_loading` deliberately: `_loading` also raises the body overlay, and covering
the content is the opposite of refreshing in place.

### 7.8 `components/taskbar.element.ts` (edited)

The task button gains the badge of §8 when the worst severity is `warning` or higher.

---

## 8. The surfaces

### 8.1 The marker

One slot, three severities, and never two markers at once. The alarm is a strictly stronger form of
the dirty state, so it replaces the dot rather than sitting beside it: with the sole exception of a
deleted clean window, there is no alarm without unsaved changes, and two markers for one condition is
noise.

**Severity is carried by an icon, not by a hue.** `info` keeps `.dirty` per D9 and is unchanged —
a dot is right for a fact the editor caused themselves, and #20's appearance must not move.
`warning` and `error` fill the same slot with an Umbraco icon instead, `icon-alert` and `icon-wrong`,
as `.notice-marker` plus a severity modifier. A dot can encode severity only as colour, which is
both weak (nobody reads a yellow dot as danger) and the one thing this design says colour must never
be. Both icons ship with Umbraco and both are stroked in `currentColor`, so the severity colour
reaches them as an ordinary `color` and no icon token has to exist.

`.notice-marker` rather than a modifier on `.dirty`, so that every theme's dot styling — a radius, a
size in the caption's own units — is not handed to a glyph it was never written for, and so that
`unsaved-marker.test.ts` keeps meaning exactly what it means today. The mapping from severity to
icon name lives in `notices.ts` beside `windowNotices`, because the marker, the badge and the banner
all need the same answer.

### 8.2 The banner

Persistent, no dismiss control, one per notice, actions owned by the notice that raises them. Nothing
duplicates, because keep and discard belong to the conflict notice, close belongs to the deleted
notice, and the trashed notice owns nothing.

**Umbraco-native rather than a wash of colour.** The window's own surface is the ground, with a 4px
severity-coloured bar on the leading edge, the severity icon at 18px, the title in ordinary text at
medium weight and the body in the secondary text colour. Filling the strip with `--uui-color-warning`
is what shipped first and it read as neither Umbraco nor a warning: that is UUI's *saturated* fill,
meant for solid controls, where native Umbraco surfaces use the colour standalone against a neutral
ground. The actions are real `uui-button`s, so they look, focus and behave like every other button in
the backoffice.

### 8.3 The taskbar badge

A slot drawn **inside** the task button's own box. `.running` keeps `overflow: hidden` in the base
and in every theme, which is why the active window marker is drawn inside the button too, and the
badge follows it.

The base draws the severity icon **inline, after the label, at the label's own text size**: at label
height beside the name it reads as part of the button, where a corner badge reads as decoration on
it. Two themes cannot use that, because macOS and Windows 11 both set `.task-label { display: none }`
and draw icon-only tiles, so each restyles the same element into an overlay on the tile's corner —
its own notification idiom. `theme/notice.test.ts` derives that requirement from a theme's own
stylesheet rather than from a list of names, so a sixth theme hiding the label cannot forget it. The
button's `title` and accessible name carry the words either way, so colour is never the only carrier.

A consequence worth writing down: a caption and a task button each hold two `umb-icon`s now, so
`.title umb-icon` and `.task umb-icon` are no longer safe selectors and the app's own icon is
`.app-icon` / `.task-icon` in the base and in all four themes that restate those rules. The macOS
theme is why it matters rather than a tidiness argument: it hides the caption's app icon entirely,
and while the two shared a selector that rule hid the severity marker with it.

### 8.4 Tokens

| Token | Default | Why it has one |
| --- | --- | --- |
| `--umbradesktop-notice-info-color` | chains to `--umbradesktop-titlebar-dirty-color` | So no theme changes to stay correct |
| `--umbradesktop-notice-warning-color` | `--uui-color-warning` | Umbraco's own warning colour, not ours |
| `--umbradesktop-notice-error-color` | `--uui-color-danger` | As above |
| `--umbradesktop-notice-marker-size` | `1.15em` of the caption's own type | The severity icon in the marker slot, which is not the dot's 8px |
| `--umbradesktop-notice-background` | chains to `--umbradesktop-window-background` | The banner's ground is the window's own surface, which Windows 98 expresses differently from macOS |
| `--umbradesktop-notice-text` | the ordinary text colour | The ground is neutral, so the text is text |
| `--umbradesktop-notice-border-width` | a px literal in the base CSS | The leading-edge bar, which is what carries severity on a neutral ground |
| `--umbradesktop-notice-badge-size` | `1em` — the task label's size | The taskbar slot, where the badge sits beside the label |

A theme may restyle these and may not remove them. Windows 98 is the useful test of the set, because
`info`, `warning` and `error` map onto icons its own dialogs already have, rather than needing a red
that is not in its palette — and because its 16-colour dark red on its navy caption is legible at
about 1.1:1, which is why its own sheet paints the caption marker in the caption's ink and lets the
icon's *shape* carry the severity there. Colour never being the only carrier is what makes that a
restyle rather than a removal.

---

## 9. The guards, inverted

Everywhere else on this desktop, closing is what loses work. Here saving is: Umbraco submits the
whole document, so saving a stale copy reverts the other writer, per §6. Closing loses only your own
work, which you know about.

- **Close, when the document changed elsewhere.** The discard dialog's wording inverts. Closing is
  the safe act and the dialog says so, rather than reusing a phrasing built to discourage it.
- **Close, when the document is only trashed.** The ordinary question, unchanged. This is keyed on
  `changedElsewhere` and not on severity, which was the first version of this rule and was wrong —
  twice over, as it turned out: the wording has to invert only where somebody else's work is at
  stake, and trashed has since become an `error`, which under the severity version of the rule would
  now suppress the prompt entirely. Core's read-only guard means
  the work cannot be saved from that window at all once it reloads, which makes the ordinary
  "discard your changes?" question more apt if anything, not less: closing still loses only the
  editor's own work, and they may well want to copy it out first. Inverting the wording there would
  push somebody towards discarding for no reason.
- **Close, at `error`.** No prompt at all. "Discard your changes?" implies a choice that no longer
  exists.
- **Exit.** The count sentence gains a clause: "3 windows have unsaved changes, 1 of them has also
  changed elsewhere." `exit-message.ts` is already a pure message builder, so this is a signature
  change and a test, not new machinery.
- **Reload.** Unchanged. It asks the same question it already asks.

---

## 10. Phase 2: seeing what changed

Tracked as [#38](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/38). Designed
here, built after phase 1 ships, and skippable. A warning that says you are about to
overwrite somebody is believed; one that shows what would be lost is acted on, and it is the only
way to tell "they fixed a typo, keep mine" from "they rewrote the intro, better look". Those want
opposite decisions from the same banner.

**Three way, and the buckets are the point.** Base is your last saved data, and your current data and
the server's copy are the two branches. Every changed property lands in one of three groups:

- Changed by both of you. The actual collision, and the only group that needs a decision.
- Changed only by them. What your save would revert, and where the German row from §6 shows up.
- Changed only by you. Safe to keep.

A naive two way diff against the server's copy would show your own typing as a difference too, which
is the mistake that would make the feature untrustworthy.

**Informative only.** No per property take or keep. The panel exists so an editor can decide whether
discarding is acceptable; merging is a different feature.

**Honest about what it cannot render.** Content is a set of typed property values and every property
editor has its own idea of a value. Text, numbers, dates, toggles and pickers render as base, theirs
and yours. A Block List, nested content or rich text says "changed" plus a countable fact where the
shape allows one, such as three blocks before and four after. Never a guess dressed as a diff, and
never a wall of stored JSON, which is accurate and unreadable and invites skipping the row that
mattered.

**Length is handled in the panel.** It opens from the conflict notice's third action, in the notice
region, capped with its own scroll, with the collision bucket expanded and the other two folded.

The deleted notice reuses the same panel with only your own column, so unsaved text can be read and
copied out before the window closes.

---

## 11. Tests, written first

| What | Where | How |
| --- | --- | --- |
| **Own write suppression, including server managed fields** | `conflict/classify.test.ts` | the first test written. `theirs` equals `mine` must hold when the server's copy carries `updateDate` and version fields the editor never had |
| The rest of the classification | same | no change, refresh, conflict, gone |
| Value equality per alias, culture and segment | `conflict/value-compare.test.ts` | pure, and it pins which fields are server managed |
| Key matching, and that an unrelated node does not match | `conflict/server-event.watcher.test.ts` | pure over the model plus a fake event |
| `Trashed` and `Deleted` route to the right severity, and `Trashed` does not alarm a clean window | same | |
| Burst coalescing, one fetch in flight per window | same | |
| A clean window calls the workspace's `reload()` and never reloads the iframe | same | fake workspace context, as `dirty-watcher.test.ts` builds one |
| The widened callback reports subjects, and follows navigation inside a window | `dirty-watcher.test.ts` | extended |
| Notice derivation, ordering and composition | `notices/notices.test.ts` | `info` yields no banner, trashed plus changed yields two notices, deleted plus clean yields one, trashed plus clean yields none |
| Banners render for `warning` and `error` and not for `info`, stack caps and scrolls | `components/window-notices.test.ts` | base window mount, as `window-dirty.test.ts` does |
| Acknowledging removes that banner and keeps the marker and badge | same | |
| Marker severity, and a marker on a clean deleted window | `components/window-dirty.test.ts` | extended |
| The badge reaches the taskbar button, and not for `info` | `components/desktop-chrome.test.ts` | alongside the existing chrome assertions |
| **No theme removes, starves or hides the marker at any severity, the banner or the badge** | `theme/notice.test.ts` over `UMBRADESKTOP_THEMES` | CSS text check, the general form of restyle never remove, as `theme/unsaved-marker.test.ts` already does for the dot |
| Close wording per severity, and no prompt at `error` | `window-manager.test.ts` | extended |
| The Exit count sentence | `exit-message.test.ts` | already a pure message builder |
| English and Dutch parity for every new key | `localization/parity.test.ts` | already enforced |

Phase 2 adds `conflict/diff.test.ts` for the bucketing, the culture case of §6, and a value it
cannot render reporting "changed" with a count.

**Browser checks, part of done and not of the suite.**

- The same document in two windows: edit one, save the other, the first alarms and the second does
  not.
- A change made from a second browser session alarms.
- **Publishing your own document raises nothing.** The case §5.2 would have broken.
- A clean window refreshes with scroll position, the open tab and split view intact, and the reload
  glyph spins while it does.
- Trash a node open in a window, then empty the bin. The content stays readable and the frame can
  still navigate away.
- All five themes at all three severities, in light and dark.

---

## 12. Risks

- **R1 — Value equality is the load bearing part.** If §5.3's comparison treats a server managed
  field as content, every save alarms. It is tested first and it is the reason the comparison is its
  own module rather than an inline `jsonStringComparison`.
- **R2 — A sub-second interleave cannot be caught.** If a colleague's save commits between your load
  and your save, and your save commits last, your copy wins and nothing client side can know. The
  guard warns before you save, which covers the realistic case of a change made while you were
  typing. Catching the collision itself needs server side concurrency tokens, which the management
  API does not offer. Accepted knowingly rather than treated as a gap: the backoffice today warns
  about none of this, so a guard that covers everything except a sub-second interleave is not a
  compromised version of a better feature, it is the only warning that exists.
- **R3 — `loadWithoutPersist()` is on the entity detail base.** A workspace that is comparable but
  lacks it cannot be classified. The gate checks for the method and such a window is simply never
  classified, in the same spirit as #20's D6: not a list of exceptions, just not a match.
- **R4 — Notice height on a short window.** The stack takes space from the body, so a window near
  the chrome's floor gives its content very little. The stack caps and scrolls, and the floor stays
  the chrome's, so the titlebar is never lost.
- **R5 — Three severities across five themes is fifteen states to check.** `theme/notice.test.ts`
  covers removal and starvation mechanically; the visual pass is in §11's browser checks.
- **R6 — A silent refresh can overwrite what was typed while its GET was in flight.** A clean
  window's treatment is `reload()`, and core's `reload()` sets both halves from the response
  unconditionally. An editor who starts typing after the fetch begins and before it lands loses
  those keystrokes, silently, because D7 settled that this refresh says nothing. Accepted rather
  than engineered around: the exposure is one request's latency on a window the editor was not
  editing a moment earlier, and closing it properly would mean reimplementing `reload()` to
  re-check dirtiness between its fetch and its apply, which is core's method to own and not this
  package's. It is in §11's browser checks so the size of the window is measured rather than
  assumed.
- **R7 — The fixtures are hand-written, so the payload can drift out from under the comparison.**
  Every test of §5.3's equality uses a model this repository typed. A future Umbraco version that
  stamps a new server-managed field *inside* `values[]`, or reorders keys inside a Block List
  value, would pass the whole suite and alarm on every save in production. This is why §11's
  "publishing your own document raises nothing" check has to be run against a real document with a
  Block List on it, and why it is part of done rather than a nicety.

---

## 13. Considered and dropped

- **A grace period after an event, waiting to see whether the window goes clean.** No fetch and no
  core internals, but an arbitrary delay that is either too short for a slow save, which flashes a
  false alarm, or too long, which delays a real one. Rejected on the grounds that arbitrary timers
  are not sustainable.
- **Patching `requestSubmit()` to know when a save starts.** Exact and timer free, and it misses
  publish entirely. See §5.2.
- **Suppressing on data equality with the window's own content and nothing else.** Close to §5.3, but
  it suppresses more than asked: a colleague saving character for character what you typed would be
  silent too. Harmless in effect, but it is not the rule anybody asked for.
- **A blocking sheet over the body for a deleted document.** It stops the editor pressing a Save
  button that will fail, which was the argument for it, and it also blocks reading your own text and
  navigating the frame elsewhere. D6.
- **A warning glyph after the taskbar label.** Invisible in macOS and Windows 11, which show icons
  only.
- **Tinting the task button as the guaranteed carrier.** No idiom in Windows 98, whose button face is
  always `#c0c0c0`, and it collides with the accent underline that already means active in Windows
  11. Themes may still add a tint on top of the badge.
- **One banner leading with the worst fact.** Needs bespoke wording per combination of facts. D2.
- **A brief mark after a silent refresh.** D7.
- **A dedicated alarm marker beside the unsaved dot.** Two markers for one condition, and it would
  have needed its own geometry in five themes.

---

## 14. Follow-ups, not this branch

- **Report the variant overwrite to Umbraco.** §6 is a core data loss path that has nothing to do
  with this package, and the merge behaviour is deliberate enough that it needs discussing rather
  than patching.
- ~~`docs/design/2026-09-08-umbraco-ai-on-the-desktop-design.md` is untracked.~~ Committed as
  `07d3b47` on this branch while this design was being written, so issue #35's link to it resolves
  once the branch lands.
- **One hub connection per window.** Every window is a backoffice document and opens its own. Its own
  issue, and this design deliberately adds nothing to the count.

---

## 15. Definition of done

- [ ] `npm run build` and `npm test` both pass
- [ ] The browser checks in §11 are all walked, including the publish case
- [ ] `README.md` names it in the Features list and in its own section, Markdown only, with a
      screenshot captured at the size it is shown
- [ ] `umbraco-marketplace.json` names it in `Description`, since being the only surface in Umbraco
      that warns an editor before they overwrite somebody is exactly what a person would choose this
      package for, plus `Tags` and a `Screenshots` entry
- [ ] `docs/theming.md` gains the notice tokens, the three severities and the taskbar badge slot
- [ ] Anything a build taught that is not obvious from the code is written down where the next person
      will hit it
