# Workspace views beside the editor - Design

> A document's workspace views (Info, and views packages add) can open beside its editor, as
> attached content: a pane inside the window, or a window grouped with it. The view is not a copy.
> It runs on the window's own workspace, so it shows the document as it is being edited and its
> actions act on it, exactly as they do from its tab. The path strip names the view on screen, and a
> side-panel button on that name opens it beside the editor, shown only for a view that works there.

- **Status:** Designed, spiked and revised 2026-10-07. Built 2026-10-07; the button moved onto the view's
  crumb after the first manual check, 2026-10-11 (D9 to D11)
- **Date:** 2026-10-07
- **Branch:** `claude/workspace-views-beside`
- **Issue:** [#131](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/131)
- **Builds on:** [attached windows](2026-09-27-attached-windows-design.md), and its guide
  [`../developer/attached-windows.md`](../developer/attached-windows.md)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

A document window shows one workspace view at a time. Info (status, template, links, history,
references, redirects) and the views packages add are things people want to see *while* editing,
not instead of it. The desktop already knows how to put content beside a window. This puts a
workspace view there.

**In scope:**

- The workspace views a **document** window shows, except editors and views with a router of their
  own (§6).
- The view on screen named in the path strip, with a side-panel button on its name, shown only while
  that view can open beside the editor.
- A setting to turn it off, and an opt-out list, in the desktop and from packages.

**Out of scope:**

- **Views with their own router.** The spike found most package views have one (§8.1, finding 4), and
  they cannot route in a pane on the desktop page. They are detected and not offered. Supporting
  them would mean giving each pane a frame of its own (§11); the button would then simply appear on
  more views, so nothing built here is thrown away.
- Opening a view by clicking its tab, and dragging a tab out. Both act before the view is rendered,
  so they cannot tell whether it will work (D6).
- Other workspaces: media, members, document types. One check in §6 keeps them out.
- Links opening a new desktop window (§5).

---

## 2. What people see

A document window shows its views as tabs, as now. The path strip names the view on screen as its
last step, with the view's own icon: **Home / Info**. Nothing is added while the window shows its
first view, the editor. While the view can open beside the editor, its name carries a small
side-panel button, with the tooltip "Keep Info beside the editor. Shift-click to open it as a
window." Clicking it moves the view into an attached pane (or a floating window grouped with the
owner, when there is no room; the desktop picks, as it does for Preview) and switches the window
back to its first view. Shift-click opens it as a floating window straight away (D11).

A view that cannot open beside the editor, such as Engage's Analytics, is still named, with no
button. So the button never offers something that then does not work.

Once open:

- **It is the same document, live.** Info shows the editor's current state, unsaved edits included.
  Picking a template in the pane marks the owner unsaved, as it would from the tab.
- **Dialogs open in the owner window**, because the modal manager the view asks for is the owner's.
- **Several can be open at once**, each its own pane, beside Preview if that is open. Opening one
  already open focuses it. The attached-window kind is per view, so one of each per owner.
- **The button is a toggle, as Preview's is** (2026-10-11). The window can still show the view in its
  tab while it is open beside; both are the same live workspace, and stopping it would mean
  overriding core's tabs. While it is open beside, the button on its crumb shows as pressed, and
  pressing it closes the pane with the window staying on the view. Shift-click then only brings it
  forward.
- **It follows the owner.** It closes when the owner closes or moves to another document. A reload of
  the same document keeps it, and the view is rebuilt against the reloaded page (§4.5).
- **Split view:** the view uses the variant whose editor it came from: the first split's.

The button is the side-panel glyph alone, the one the Dock button draws, never the pop-out glyph:
the pane header's Pop out does the opposite (pane to floating window), and the attached-windows guide
§6 already records that two look-alike actions read as one. Preview draws the same glyph after its
label, so the glyph means "opens beside this window" wherever it appears (D10).

---

## 3. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The view runs on the **owner's own workspace**, not a second copy of the document | A second copy cannot see unsaved edits, and its actions (Info's template picker) would edit the copy. Shared, the pane is the tab moved, nothing more |
| D2 | **Generic by mechanism, documents by scope** | The bridge (§4) forwards whatever a view asks for, so nothing is per view. What is offered is narrowed by one rule (§6) |
| D3 | **Opt-out**, with a desktop list and a package list | Once editors and routed views are left out, what remains worked in the spike. The lists catch what the rule cannot see |
| D4 | Editors are left out **by kind**, routed views **by detection** | Neither needs a list kept up to date, and both cover package views nobody has seen |
| D5 | **One button**, and a setting that is **on or off** (default on) | Off is the way out if it misbehaves or someone dislikes it. A second mode is not needed with only one way in |
| D6 | **No tab-click modes** (an Always mode, clicking the active tab) | The button shows only while the view is on screen in the window, so the desktop can look inside it before offering it. A tab click comes before the view exists, so it would sometimes open beside and sometimes not, which is worse than not offering it |
| D7 | A link in the pane **navigates the owner**, as it would from the tab | Same link, same result, wherever the view is |
| D8 | The pane holds **no work of its own**, though its view can edit | The attached-windows rule is read-only because a pane must hold nothing to lose. Here the work sits in the owner, so closing the pane loses nothing and the rule's reason still holds |
| D9 | The button sits **on the view's name in the path**, not at the strip's end beside Preview | Added 2026-10-11. The first build put an "Open beside" button next to Preview, and in the first manual check it read as unclear: it named nothing, and it acts on the view while Preview acts on the document, so it came and went beside a button that never does. On the view's own crumb it is labelled by the name it sits on, and coming and going with that name reads as part of it |
| D10 | **One glyph for opening beside the window**, on the view button and on Preview | Added 2026-10-11. The icon or label says what opens, the side-panel glyph says how. Preview keeps its eye icon and label and gains the glyph after them |
| D11 | **Shift-click opens it as a window**, for both; no second button | Added 2026-10-11. Pane and window are one click apart already (Pop out, Dock), and the desktop picks a window when there is no room. Shift-click is the browser's "new window", so it is a known gesture, and the tooltip says so. Remembering the form someone last used was considered and left: a setting for the default form, covering Preview and views alike, is the later option, being visible where remembering is not |

---

## 4. The bridge

### 4.1 What the pane holds

A small host element of ours, opened with `openAttached` like Preview, so it lives inside the
desktop element and therefore inside the app (icons are found by an event that rises to a registry
near the app root; a host outside it shows none, §8.1). Props: the owner's id and the view's manifest
alias. On connect it builds the view's element from its manifest with `createExtensionElement`, sets
`manifest` on it as core's workspace editor does, and mounts it inside itself. The desktop page
registers the same extensions as the frame, so any view the frame can show, the pane can build.

Default width 920px, the width Info needs for its two columns, and the same as Preview.

### 4.2 How requests travel

A view gets everything through context requests: `umb:context-request` events that rise until a
provider answers. Anything the pane does not provide itself reaches the host. The host stops it and
dispatches a look-alike event (the four fields core reads, as `frame-context.ts` already does) in
the owner's frame, from the first split's `umb-workspace-editor` element. From there it rises through
the owner's providers exactly as if the view sat in its tab: the document workspace, the variant's
property dataset, publishing, validation, modals, notifications. Nothing is listed or proxied one by
one.

**The anchor is the editor element, not the router slot inside its shadow root.** From the editor,
the route context a view gets is the document's (`…/edit/{id}/{variant}/`), so the modal routes it
registers hang off the document. A link to one moves the owner within the same document and the pane
stays. From the router slot they would hang off `/view/<pathname>/` and switch the owner's view.

### 4.3 Fallback

A provider answers during the dispatch itself, so the host knows straight away whether the frame
answered. Core's provider stops a request whose alias matches even when it turns it down, so the host
also notes whether the frame *matched*. Only a request the frame neither answered nor matched goes on
up the desktop page, dispatched from the host's shadow root's host (a node directly in a shadow root
has no `parentElement`). In the spike nothing fell back.

### 4.4 Two copies of the backoffice, and the two fixes

The view's code is the desktop page's copy of the backoffice; its data objects are the frame's.
Reading observables and calling methods works across that line, including functions passed from the
pane into the frame (the template picker's filter). Two things do not, and the bridge fixes both for
each frame that hosts a pane:

- **Modal tokens.** `UmbModalContext` (`packages/core/modal/context/modal.context.js:37`) reads a
  modal's defaults only when `alias instanceof UmbModalToken`, and the pane's token is the desktop
  page's class. The bridge gives the frame's `UmbModalToken` a `Symbol.hasInstance` that also accepts
  the desktop page's `UmbModalToken`, and nothing else. Core has eight `instanceof Umb…` checks in
  all; the error ones already fall back to comparing `name`, and this is the only one that broke.
- **Provide events.** A save makes the owner withdraw and provide again the dataset, the variant
  context and the route addendum. Core's consumer, once withdrawn, waits for a provide event on its
  own page's `window` (`context-consumer.js`, `#setCurrentScope(window)`), which the frame's never
  reaches. The bridge relays the frame's `umb:context-provide` events to the desktop page's `window`,
  only for aliases the pane has asked for.

Unprovide needs nothing: once answered, core's consumer listens on the provider's own element
(`#setCurrentScope(instance.getHostElement())`), which is in the frame.

### 4.5 Lifecycle

- **The owner reloads.** The frame's page is replaced. A pane left alone keeps showing values from the
  dead page, silently. So on every frame load the host remounts the view against the new page and
  applies both fixes to it again. The path watcher already reports a frame's new document.
- **Another document:** attached content already closes (attached-windows guide §5).
- **The setting turned off:** every view pane closes at once.

### 4.6 Styling

The view renders in the desktop page, which runs the same backoffice with the same backoffice
theme, so it looks as it does in its tab. The pane header, splitter and floating strip come from the
attached-window code and are already themed. The page title is unaffected (measured).

---

## 5. Links

Each page of the backoffice listens for clicks on its own `window`
(`packages/core/router/router-slot/util/anchor.js`), finds the anchor on the click's composed path,
and navigates that page. A link in the pane is in the desktop page, so the desktop's router would
take it and navigate the whole desktop away. Info has such links (document type, template,
references, history).

**Rule: a link in the pane navigates the owner window.**

- The host listens for clicks on itself, which runs before the click reaches the desktop page's
  `window`. For a same-origin backoffice path it stops the click and repeats the navigation in the
  owner's frame, through the frame's own router, so core's unsaved-changes prompt in the owner still
  applies.
- Info's document type and template links are modal routes on the document (§4.2), so they open as a
  dialog in the owner and the pane stays. Measured. Another document: the owner moves there and the
  pane closes, since attached content follows its owner. Declining the owner's unsaved prompt leaves
  both where they were.
- Left alone: clicks with a modifier key (core's router ignores them too), links with a `target` such
  as Info's `_blank` public URLs, downloads, other origins, and clicks the view already handled
  (`defaultPrevented`). Each does what it does in the tab.
- The anchor check goes by tag name. Core's uses `instanceof HTMLAnchorElement`, which is per page.

Not a new window for references: it would make the pane differ from the tab, and the desktop has no
"open this backoffice path as a window" helper yet. Ctrl-click already gives a browser tab.

---

## 6. Which views are offered

One rule, decided while the view is on screen in the window. The button shows when all hold:

1. The setting is on.
2. The owner shows a document. The Preview route parser (`preview/preview-target.ts`) recognises it,
   extended to read the `/view/<pathname>` the route ends in.
3. That pathname belongs to a view the owner's editor shows, matched to its manifest.
4. The view is not one of the editor kinds: `contentEditor`, `contentTypeDesignEditor`, `collection`,
   `contentCollection`, `tree`.
5. The view's alias is on neither opt-out list.
6. **The view, as rendered in the window, holds no router slot** (`umb-router-slot`), looked for
   through its shadow roots. Checked when the window's view changes, and again on click, since a view
   may build its router after loading.

Rules 2 to 5 are pure and tested as such. Rule 6 reads the frame, and is the one a view that builds
its router much later could slip past; the opt-out lists are the net for that.

### 6.1 The opt-out lists

- **The desktop's**, a small source file of its own. It starts empty: the spike found no core view
  that breaks once routed ones are left out. Kept apart from `catalogue/exclusions.ts`, which is
  about launcher tiles.
- **Packages'**, one more optional field on the `umbraDesktopCatalogue` manifest: a list of workspace
  view aliases that should not open beside the editor. Data only, so a static `umbraco-package.json`
  can carry it, and an author whose view breaks can say so without waiting for our release. The lists
  add up; there is nothing for two packages to disagree about.

---

## 7. The setting

- In **General**, under Reopen windows: a toggle, along the lines of "Open workspace views beside the
  editor", on by default. Labels in `localization/en.ts` and every language the package ships.
- Stored on the user account like the other settings, so it follows the person across browsers.
- **Turning it off closes any views open beside a window**, at once, not after a reload.

---

## 8. The spike

Throwaway code in this worktree, in a real backoffice, before any real code, answering: where
requests start in the frame; whether Info works fully; what the owner's lifecycle does to the pane;
and whether package views work.

### 8.1 Findings (2026-10-07)

Measured on the worktree's test instance (CMS 17.6, Engage, Workflow), driving headless Chrome. The
spike mounted each view in a panel inside `umbradesktop-desktop`'s shadow root and forwarded its
context requests as in §4.2. Scripts in that session's scratchpad `spike/`.

**1. Anchor.** From the editor element, every request Info makes (14 aliases) was answered in the
frame; none was rejected or fell back. The modal routes Info registers came out on the document's
route. Decided in §4.2.

**2. Info works fully, after two fixes** (§4.4). Without the token fix, the template picker opened as
a small empty dialog; with it, as a sidebar in the owner with the tree, its filter greying out the
disallowed templates exactly as in core. Without the relay, Info's "last edited" froze after a save;
with it, the date moved on the next save. Removing the template in the pane marked the owner unsaved
and updated the pane live; saving in the owner cleared it (`saves` moved). The template link opened
the template editor as a dialog in the owner, the desktop stayed where it was, and the pane stayed.

**3. Lifecycle.** Reloading the owner left the pane showing stale values, silently, and one late
request fell through to the fallback. A remount against the new page worked (§4.5). Not measured:
variant switching and split view (the test content is invariant), and the floating form (the bridge
does not depend on where the host sits in the desktop page).

**4. Package views: most have their own router.**

| View | Own router | Beside the editor |
| --- | --- | --- |
| `Umb.WorkspaceView.Document.Info` | no | works, with the two fixes |
| `Engage.WorkspaceView.AbTesting` | no | renders, no errors |
| `Engage.WorkspaceView.Analytics` | yes, 3 router slots | renders; its tabs link to `/umbraco/section/umbradesktop/devices` |
| `Engage.WorkspaceView.Personalization` | yes, 3 router slots | renders; tabs link to `/umbraco/section/umbradesktop/…` |
| `Workflow.WorkspaceView.Document` (kind `contentEditor`) | yes | renders; tabs link to `/umbraco/section/umbradesktop/tab/history` |

A router slot routes against its own page's real address. In the pane that is the desktop's, so the
view's internal tabs point into the desktop section. Rerouting them to the owner would send the owner
to the desktop section; letting them through would put the view's state in the desktop's own address,
shared by every pane. Hence rule 6 in §6. The sample is two vendors, both Umbraco HQ; a view with tabs
of its own will generally have a router, a panel of information generally will not.

**Smaller findings,** each folded into §4: icons need the host inside the app; Info needs about
920px; the page title is unaffected; the fallback must dispatch from the shadow root's host. And
Workflow's view is kind `contentEditor`, so rule 4 would leave it out even without rule 6.

### 8.2 The decision it led to

Three options were put to Luuk: only router-less views; give each pane a frame of its own so routed
views get their own address; or let pane routers use the desktop's address (rejected outright).
Some views working and others not is the thing to avoid, and a button that shows only where it works
avoids it without the cost of a frame per pane. So: router-less views, by detection, and button only
(D5, D6).

---

## 9. Tests, written first

Each watched failing before its code:

- **The offer rule** (§6, rules 1 to 5), pure: the setting, document owners only, pathname to
  manifest, kinds, merged opt-out lists.
- **Router detection** (rule 6): a view element with a router slot somewhere in its shadow trees is
  refused, one without is offered. Plain elements, no backoffice.
- **The active view from the route**, extending the Preview parser.
- **The link rule** (§5): which clicks are rerouted, and which pass (modifiers, `target`, download,
  other origin, `defaultPrevented`).
- **Forwarding** (§4.2, §4.3): a request the pane does not answer reaches a stand-in for the frame's
  anchor; one the stand-in matches but turns down does not fall back; one it neither answers nor
  matches falls back to the page.
- **The two fixes** (§4.4): a page-class token passes the frame class's `instanceof`, and nothing
  else newly does; a provide event in the frame for an alias the pane asked for reaches the page's
  `window`, and one for another alias does not. Two plain classes and two event targets stand in for
  the two pages.
- **Path strip:** the button shows only when the rule says so; turning the setting off removes it.
- **The setting:** its default, that it is stored, and that turning it off closes open view panes.

Then `npm run build` and `npm test`, and the spike's checks repeated in a real backoffice against the
real code: Info, A/B Tests, a routed view getting no button, the owner reloading.

---

## 10. Risks

| Risk | Answer |
| --- | --- |
| A view breaks across the two copies of the backoffice in a way the spike did not see | The opt-out lists; the setting is the person's own way out |
| A view builds its router after rule 6 looked | Checked again on click; the opt-out lists for anything later still |
| A core update adds an `instanceof` that matters, or renames the provide event | Both fixes live in one module next to `frame-context.ts`, which already depends on core's event names; the real-backoffice check catches a regression |
| The owner re-provides something new on an action the spike did not try | The relay is generic: any provide for an alias the pane asked for is relayed |
| Two places editing one workspace confuse people | They are the same workspace, so there is one state and one unsaved marker, the owner's |

---

## 11. Alternatives considered

- **A second copy of the document in the pane**, loading the view's route in its own frame with the
  rest stripped. Cheap and generic, but blind to unsaved edits, and its actions edit the copy.
  Rejected for D1.
- **A frame of its own per pane, bridged to the owner** (§8.2, option B). Would give routed views an
  address of their own, so every view would work. Costs a backoffice boot per pane and a larger
  build. Not now; if routed views turn out to matter, it extends this design rather than replacing
  it, since the button would just appear on more views.
- **A split inside the owner's frame**, injecting a second view area into core's workspace layout.
  No two copies of the backoffice, but no floating form, and it writes deep into core's layout.
- **A three-way setting with an Always mode, and clicking the active tab.** Designed first; dropped
  for D6 once the spike showed that many views cannot open beside the editor.
- **Opt-in by entry**, the desktop and packages listing the views that may open beside. Dropped for
  D3: with editors and routed views detected, what remains is expected to work.
- **A menu in the path strip listing every view.** Repeats the tabs and grows with every package
  view. One button for the view on screen does the same in less room.
- **A pop-out button in the corner of each view.** Writes into core's layout, which its router and
  Lit re-render at will, and needs styling for every backoffice theme.
- **Dragging a tab out.** Invisible, and takes over core's tab bar.

---

## 12. Definition of done

- [ ] `npm run build` and `npm test` pass
- [ ] A user-guide page for the feature and the setting, in its category's `README.md`, linked from
      the pages that mention Info or attached content
- [ ] `docs/developer/package-catalogues.md`: the opt-out field
- [ ] `docs/developer/attached-windows.md`: this as a consumer that edits, and why D8 keeps the rule's
      reason; and, for anyone building on the bridge, the two fixes and the router limit
- [ ] `umbraco-marketplace-umbraco.community.umbradesktop.json` `Tags`; a screenshot if it changes
      what the package looks like. `Description` unchanged
- [ ] `README.md`: probably nothing, at most one line
- [ ] The build's traps written into this doc

---

## 13. Build notes (2026-10-07 to 2026-10-11)

What the build found that the code does not make obvious:

- **The frame's `UmbModalToken` is reached through an entry point, not `eval`.** The spike imported it
  by evaluating code in the frame, which a Content Security Policy would block. Every backoffice page
  loads this package, frames included, so a `backofficeEntryPoint` (`beside/realm.entrypoint.ts`)
  publishes each page's own class on its window under a registered symbol, and the desktop reads the
  frame's from there.
- **Never `instanceof Element` across the two pages.** The walks through the frame's shadow trees
  test `nodeType`, because the frame's elements are made by the frame's `Element`.
- **When to look at the view on screen.** The frame's router fires `navigationsuccess` on its window
  once a slot has put its new page in, but the view renders its own shadow tree a moment later, so a
  router inside it is not there yet. The window looks once straight away and once 400 ms later, and
  again on click.
- **Every link click in the pane is stopped at the host**, including the ones left to the browser.
  The desktop page's router does not skip shift-clicks or clicks a view already handled, so letting
  those through would navigate the whole desktop. Only a rerouted click is also prevented, so the
  browser still opens a new tab or a download.
- **A cold reload of the owner takes a while.** With Engage, Deploy and Workflow installed the
  reloaded frame took more than 15 s in headless Chrome before the pane could remount; it shows
  "Waiting for the document" until then and gives up after 30 s.
- **"Last edited" only moves on a save that changes something.** A save with nothing changed does
  not move it, in the pane or in core's own Info, so test it with a real edit.
- **Opening attached content as a window** is an option on `openAttached` (`{ floating: true }`), so
  Preview and views share it.
