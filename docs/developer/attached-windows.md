---
id: attached-windows
title: Attached windows
description: Show content beside a document window, as a docked pane or a grouped window.
sidebar_position: 7
---

# Attached windows

How to show something beside a document window: a preview of it, what changed in it, its copy on
another environment. Written for two readers. One is a contributor whose issue needs content next to
a window. The other is an AI agent building a feature or an add-on on this desktop. Both should be
able to build a consumer from this page without reading the window manager.

The reasoning behind each rule is in the design doc,
[`design/2026-09-27-attached-windows-design.md`](../design/2026-09-27-attached-windows-design.md). This
page is what the built code does, and what it expects from you.

---

## 1. What you get

You hand the window manager an app and the window it belongs to. The desktop shows it in one of two
forms, and the person using it can switch between them at any time:

- **Docked.** A pane inside the owner window, beside its content, behind a splitter. It has a small
  header with its icon, its title, reload, pop out and close. It has no minimize, maximize or taskbar
  button, because it goes wherever its window goes.
- **Floating.** A window of its own with the full set of controls. A strip under its titlebar says
  "Attached to *owner*" and has a Dock button. Its taskbar button sits in one box with its owner's.

Either way it belongs to its owner: it rises with it, minimizes with it and closes with it.

## 2. When to use it, and when not

Use it when the content only means something next to one specific window, and describes what that
window is showing.

Do not use it for:

- **Something a person opens from the launcher.** That is an ordinary app. Attached content is only
  ever opened by a feature, from a control on or in its owner.
- **Something that outlives its owner.** Closing the owner closes it, and so does the owner moving
  to a different document. If your content should survive either, it is a window of its own.
- **Editing in your own element.** An element you build should be read-only. Moving between pane
  and window remounts it, and the desktop cannot see what an element holds. The preview, a diff and a
  read-only copy from another environment hold nothing to lose. A view that edits its owner's own
  work (§8) is fine too: the work stays in the owner.

  A backoffice page is the exception, because the desktop can see its unsaved changes (§9). While
  one holds some, the desktop greys Pop out and Dock with "Save or discard your changes first", and
  closing the pane, the owner or the page's window asks with Umbraco's own discard dialog. So an
  editor that needs to edit beside a window should be one of Umbraco's own pages, not an element.
- **A second level.** Attached content cannot own attached content. `openAttached` refuses a
  floating attached window as an owner.

## 3. Opening it

Build an element app and open it with `openAttached`:

```ts
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopApp } from '../types';

const app: UmbraDesktopApp = {
  alias: 'umbradesktop.compare',            // the kind: one of each per owner
  name: 'Compare: Home',                     // the pane header and titlebar text
  icon: 'icon-split',
  content: {
    kind: 'element',
    element: () => import('./compare.element.js'),
    props: { ownerId, unique },              // assigned onto the element before it connects
  },
  chromeProfile: 'bare',
  defaultSize: { w: 600, h: 700 },           // the pane width asked for, and a floating window's content size
  minSize: { w: 320, h: 300 },               // the narrowest the pane may get
};

const id = manager.openAttached(ownerId, app, 'right');
```

What each part does:

- **`alias` is the kind.** An owner has at most one of each kind, counted across panes and floating
  windows together. Asking for a kind that is already open focuses it and returns its id. So the
  alias is per feature, never per document: `umbradesktop.preview`, not `preview-<guid>`.
- **`side`** is where it docks: `'left'` or `'right'` of the owner's content.
- **The return value** is the content's id, or `undefined` when the owner is not an open ordinary
  window. The id stays the same when the content moves between pane and floating window.
- **The desktop picks the form.** It opens a pane when the owner can widen by the pane's width and
  still fit on the desktop, or, for a maximized or snapped owner, when the editor keeps its minimum
  after giving the pane its width. Otherwise it opens floating. Your content must work in both.
- **Shift-click asks for a window.** Pass `{ floating: true }` as a fourth argument to open it
  floating even where a pane would fit, and do that when your control is Shift-clicked, as Preview
  and the views beside the editor do. Content already open is focused either way.

To make your control a toggle, which is what people expect from a button that opens a panel, look
up what is open with `attachedKind` from `window-group.ts` and close it with `closeAttached`:

```ts
import { attachedKind } from '../window-group';

const open = attachedKind(manager.getWindows(), ownerId, app.alias);
if (open) manager.closeAttached(ownerId, open.kind === 'pane' ? open.pane.id : open.window.id);
else manager.openAttached(ownerId, app, 'right');
```

Show the control as pressed while `attachedKind` finds something, and set `aria-pressed`. Draw the
side-panel glyph on it, the one Preview draws after its label: it means "opens beside this window"
wherever it appears, and the icon or label beside it says what opens.

**Where the control goes.** Not in the titlebar. Every theme sums its titlebar controls into its
drag-clamp metrics and measures them in its `metrics.test.ts`, and a control that only some windows
draw breaks that sum in the unsafe direction. The path strip is the place for a document window,
which is where Preview is. A notice action is the place for content that answers a notice.

## 4. What your element must do

The same element is mounted as a pane or as a floating window, and remounted every time it moves
between the two.

- **Read your props in `connectedCallback`, not the constructor.** The app host assigns
  `content.props` onto the element before it connects, and again if they change. A constructor takes
  no arguments and runs before the assignment.
- **Fetch on connect.** Reload, dock, undock and pop out all remount the element, so anything it
  holds is rebuilt. That is the reason an element must hold no unsaved work.
- **Fill whatever box you are given.** A pane's width comes from its splitter and a floating window's
  from its frame. Do not assume a width, and keep working down to your `minSize.w`.
- **Resize yourself by kind, not by id.** A device-width button calls
  `manager.setAttachedContentWidth(ownerId, alias, contentWidth)`. The manager knows which form you
  are in, sets a pane's width directly or adds the theme's chrome to a floating window's, and keeps
  the editor its minimum.
- **Follow the owner through `manager.windows`.** Find the owner by `ownerId` and read three fields:
  - `dirty`: the owner holds unsaved changes.
  - `saves`: a counter that moves each time the owner's document gets a new saved version. That
    covers its own save or publish, and a clean window's refresh after somebody else saved. A load,
    a discard and a different document's load do not move it.
  - `changedElsewhere`: somebody else saved while the owner had unsaved changes, so the owner was
    not refreshed. In that case this is the only sign the saved version moved.

  Keep the previous values and act on a change, never on every emission: the list emits on every
  move, resize and focus. The preview's rule is `previewReloadNeeded` in `preview/preview-model.ts`,
  which reloads when `saves` moves or `changedElsewhere` turns on, and not on typing.
- **Find the document from the owner's route.** The owner's body is an iframe on a backoffice
  route. The preview reads its path with `previewTargetFromPath` (`preview/preview-target.ts`), which
  understands `/workspace/document/edit/{id}/{variant}`, including split views and invariant
  documents.
- **Take the keyboard yourself if you need it.** The desktop never moves focus into a pane. When the
  window becomes active the keyboard goes to the owner's own app, if the owner is an app window, and
  a click in your pane is left to you, as in any window body. Floating, you are an ordinary app
  window and get what `docs/developer/desktop-apps.md` §7.1 describes.

## 5. What the desktop does for you

Do not re-implement any of these. Each is tested, and a second copy would drift.

- Placement: widening the owner for a pane, shifting it onto the desktop, taking width from the
  editor beside a maximized or snapped owner, falling back to floating, and giving the width back
  when the pane goes.
- The pane header (reload, pop out, close), the splitter, and the floating window's strip with Dock.
- Undocking by Pop out or by dragging the header, and docking by Dock or by dropping on a dock zone.
- Stacking: the owner and its floating windows rise as one, with the focused one on top.
- Minimizing: the owner takes its floating windows with it, and restoring it brings back what went
  with it.
- Closing: closing the owner closes its attached content, asking first about unsaved work in its
  panes and floating windows. The owner moving to a different document closes it too. A reload of
  the same document does not.
- Unsaved work in a backoffice page (§9): the owner's titlebar and taskbar marker, Exit's warning,
  greyed Pop out and Dock, and the question before closing or reloading it.
- The taskbar group box.
- Theming. The pane header and the strip take the path strip's height and tokens, and their buttons
  take the `strip-button-*` tokens. See `docs/developer/theming.md` §3.

## 6. Traps the build found

- **A page that refreshes itself must not also be reloaded.** Umbraco's own preview page refreshes
  over its own hub when the document is saved. Reloading its frame on `saves` as well made it flash a
  "connection lost" warning. The preview checks for that page with `previewRefreshesItself` and
  leaves it alone. If your content embeds something live, find out whether it already follows saves.
- **Fetch the URL again rather than reloading the frame.** A preview provider may hand out a URL that
  is good for one session only. The preview asks the server each time and adds a cache-buster.
- **Whether a frame was refused is invisible.** A site that forbids framing shows as an empty or
  error page, and the parent cannot tell. Always give a way out; the preview's is "Open in a new
  browser tab".
- **Two actions that look alike read as one.** Pop out is a picture-in-picture glyph, Dock is the
  same frame with a side panel filled, and leaving the desktop is spelled out with the external-link
  arrow. If your toolbar adds actions, keep them distinguishable from these. The side-panel glyph is
  also what a control that opens attached content draws, so do not reuse it for anything else.
- **A control that names nothing reads as nothing.** The first build of the views beside the editor
  put a plain "Open beside" button next to Preview, and it was unclear what it would open. Put your
  control where the thing it opens is named, and let it come and go with that name.
- **Size for the content people will put in it.** Umbraco's own preview page lays out badly below
  about 920px, so the preview asks for 920. A pane narrower than its content wants is a pane people
  pop out straight away.
- **A slow fetch can land after a newer one.** Count your requests and drop an answer that is not
  the latest, as the preview's `#fetch` counter does.
- **Umbraco will not lay out below 920px on its own.** Its app element has a minimum width of 920, so
  a backoffice page in a narrower frame is drawn at 920 and loses its right side: the Save button and
  the workspace's views. The desktop lifts that minimum in attached content only (`narrow` in
  `frame-watches.ts`). Core's media workspace lays out properly at 560.
- **Tell a frame's router only about a route that happened.** Routing a page pushes on its history;
  a workspace with unsaved changes refuses the push and opens its dialog. A `popstate` sent after a
  refused push makes the router navigate again, and core closes its dialog when it does, so the
  editor never sees the question. `routeFrame` sends it only when the address moved.

## 7. The worked example

The preview is the first consumer and the one to copy from:

| File | What it shows |
| --- | --- |
| `preview/preview-model.ts` | The app factory, `createPreviewApp`, with the alias, sizes and props. Also the pure rules: when to reload, which providers to offer, whether a page refreshes itself |
| `preview/preview-target.ts` | Reading the document and variant off the owner's route |
| `preview/preview.element.ts` | The element: props, following the owner, fetching, resizing by kind |
| `components/window.element.ts`, `#onPreview` | The toggle that opens and closes it |
| `components/window-path.element.ts` | The control in the path strip, pressed while open |

Each pure file has a `.test.ts` beside it, written first. Do the same: the rules your content follows
(when to refetch, what to show while the owner is dirty) are pure functions, and they are where the
bugs are.

## 8. A consumer that edits: workspace views beside the editor

A document's workspace views (Info, and views packages add) can open beside the editor. They are the
second consumer, and the first that edits, so read this before building on it. User guide:
[Views beside the editor](../user/windows/views-beside-the-editor.md). Reasoning:
[the design](../design/2026-10-07-workspace-views-beside-design.md).

**The view runs on its owner's workspace.** Nothing is copied. The pane's host builds the view's
element from its manifest on the desktop page, and answers every context request it makes from the
owner's frame, asked from the first split's `umb-workspace-editor`. So the view shows unsaved edits,
its actions change the owner, and its dialogs open in the owner. That is why it may edit: the work
sits in the owner, which guards it as it guards any other unsaved change, and closing, docking or
reloading the pane loses nothing.

**Two copies of the backoffice meet in it**, the desktop page's code and the frame's data. Two things
do not cross that line, and `beside/bridge.ts` fixes both for each frame that hosts a view:

- Core's modal context checks its token with `instanceof UmbModalToken`, and the view's token is the
  desktop page's class. The frame's class is taught to accept it. The frame's class is reached
  through a `backofficeEntryPoint` that publishes each page's own classes on its window
  (`beside/realm.ts`), never by evaluating code in the frame.
- Core's consumer waits for a re-provide on its own page's `window` once a context is withdrawn,
  which a save does. The frame's provide events are relayed to the desktop page's `window` for the
  aliases the view asked for.

Both are applied again on every load of the owner's frame, and the view is rebuilt against the new
page. `beside/owner-frames.ts` is where the host hears about those loads.

**Views with a router of their own are not offered.** A router slot routes against its own page's
address, which beside the editor is the desktop's. The window looks for one in the view as rendered,
and again on click. Editor kinds are left out by kind, and packages can opt a view out in their
catalogue ([Package catalogues](package-catalogues.md#11-keeping-a-workspace-view-from-opening-beside-the-editor)).

**Links in the view navigate the owner.** The host stops every link click in the view, because the
desktop page's router would otherwise take it, and repeats the backoffice ones in the owner's frame.
A click left to the browser, such as one with a modifier or a `target`, still does what the browser
does.

| File | What it shows |
| --- | --- |
| `beside/beside-model.ts` | The app factory and the pure rules: which view is offered, the opt-out lists, which attached content is a view |
| `beside/beside-offer.ts` | The offer and the named view, read from the owner's frame |
| `beside/frame-views.ts` | Finding the anchor, the rendered view and a router inside it, across shadow roots |
| `beside/bridge.ts` | Forwarding requests, the token fix and the provide relay |
| `beside/link-rule.ts` | Which clicks go to the owner |
| `beside/beside-host.element.ts` | The element in the pane: building, remounting and bridging the view |
| `components/window.element.ts`, `#onBeside` | The toggle, and Shift-click for a window |

## 9. A backoffice page beside an app window

An app window can show one of Umbraco's own pages beside itself: the Media Manager opens the media
item you click in core's own media workspace, beside the folder. This is the third consumer, and the
first whose content holds unsaved work. User guide:
[Media Manager](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/src/Umbraco.Community.UmbraDesktop.Media/docs/user/media-manager.md).
Reasoning: [the Media Manager design](../design/2026-10-17-media-manager-design.md) §8 and its plan's
decisions 1 and 2.

**An app asks with events, not with `openAttached`.** A package cannot import the window manager, so
the app element dispatches `umbradesktop-open-attached` with a key and a path, and reads what is open
from its `attached` property. [Building a desktop app](desktop-apps.md#75-showing-a-backoffice-page-beside-your-window)
has the calls. The window turns the request into attached content of `content.kind: 'iframe'` under
the alias `umbradesktop-attached:<window id>:<key>`, so there is one page per key.

**The page is a frame on its own route, and gets a window's watches.** Chrome stripping to the
workspace, the theme, unsaved changes, notifications, Help and the address are the same watches a
backoffice window gives its frame, from one shared module, `frame-watches.ts`, whether the page is a
pane or a window. A pane reports its unsaved changes and its address to the manager under its own id
(`setPaneDirty`, `setPaneLocation`), and the owner counts as dirty while any of its panes is.

**One page per key, routed rather than replaced.** Asking for another page under an open key pushes
it on the frame's own history (`routeAttached`), so the workspace's own guard asks about unsaved
changes inside the frame. The header takes the new name once the frame reports the new address, so a
No leaves it naming the page still on screen. Asking for the page it is on only renames it.

**Unsaved work is guarded, not lost.** Pop out and Dock remount the frame, so both are greyed while
the page is dirty, with "Save or discard your changes first" as their title, and the manager refuses
them too (`undock`, `dock`). Closing the pane asks (`requestCloseAttached`), closing the owner asks,
and the pane's reload asks. A page that moves between pane and window opens on the address it had
reached, not the one it was opened on.

**Server events reach it as they reach a window.** A pane reports what its page shows under its own
id, and the server-event router matches a pane like a window (`serverEventTargets`). A clean page
whose item is trashed elsewhere reloads in place, so core shows it read-only; an item deleted for good
closes the pane, without asking, since nothing is left to save.

**An app can ask for one of its own element apps the same way** (#141). Instead of a `path`, the
request names an `umbraDesktopApp` alias (`app`), and the window attaches that app's element under
the same `umbradesktop-attached:<window id>:<key>` alias, sized by its manifest, with `ownerId` and
`appAlias` as props. It is how Media Cleanup shows its details pane beside its list: an element that
reads the package's own desktop context, which a backoffice page never could. The window looks the
alias up among the apps the person can launch (`findApp`), so a hidden app works and one behind a
condition the person fails opens nothing. It has no page to route, so asking again only renames it.

| File | What it shows |
| --- | --- |
| `frame-watches.ts` | The watches a backoffice frame gets, the theme controller, `routeFrame` |
| `windows/attached-page.ts` | Reading an app's request, the page's app or the app's own element app, and the paths an app is told |
| `components/window.element.ts`, `#onOpenAttached` | The events, the `attached` property, routing or renaming an open page |
| `components/window-pane.element.ts` | A page pane: watches, the loader, Pop out greyed, close and reload asking |
| `window-manager.context.ts` | `setPaneDirty`, `setPaneLocation`, `routeAttached`, `relabelAttached`, `requestCloseAttached`, `serverEventTargets` |

## 10. Checklist

- [ ] An element app with a per-feature `alias`, sensible `defaultSize` and `minSize`, and `props`,
      or a backoffice page or a package's own hidden app opened with `umbradesktop-open-attached`
- [ ] Opened by a feature, from a control outside the titlebar, which toggles and shows as pressed
- [ ] Reads props in `connectedCallback` and fetches on connect
- [ ] Works as a pane and as a floating window, from `minSize.w` upward
- [ ] Holds no unsaved work in an element; unsaved work only in a backoffice page, which the desktop
      guards
- [ ] Follows the owner by changes in `saves`, `changedElsewhere` and `dirty`, not by every emission
- [ ] Resizes itself with `setAttachedContentWidth`, if at all
- [ ] Has a way out when its content cannot be shown
- [ ] Tests for its pure rules, written first, and `npm run build` and `npm test` both pass
