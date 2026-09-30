# Attached windows

How to show something beside a document window: a preview of it, what changed in it, its copy on
another environment. Written for two readers. One is a contributor whose issue needs content next to
a window. The other is an AI agent building a feature or an add-on on this desktop. Both should be
able to build a consumer from this page without reading the window manager.

The reasoning behind each rule is in the design doc,
[`design/2026-09-27-attached-windows-design.md`](design/2026-09-27-attached-windows-design.md). This
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
- **Editing.** Attached content should be read-only. The desktop does not guard unsaved work in a
  pane, and a pane is where your content usually is. Every consumer so far (a preview, a diff, a
  read-only copy from another environment) holds nothing to lose.
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
  after giving the pane its width. Otherwise it opens floating. You do not get a say, and your
  content must work in both.

To make your control a toggle, which is what people expect from a button that opens a panel, look
up what is open with `attachedKind` from `window-group.ts` and close it with `closeAttached`:

```ts
import { attachedKind } from '../window-group';

const open = attachedKind(manager.getWindows(), ownerId, app.alias);
if (open) manager.closeAttached(ownerId, open.kind === 'pane' ? open.pane.id : open.window.id);
else manager.openAttached(ownerId, app, 'right');
```

Show the control as pressed while `attachedKind` finds something, and set `aria-pressed`.

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
  holds is rebuilt. That is the reason attached content must hold no unsaved work.
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
  window and get what `docs/desktop-apps.md` §7.1 describes.

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
  floating windows. The owner moving to a different document closes it too. A reload of the same
  document does not.
- The taskbar group box.
- Theming. The pane header and the strip take the path strip's height and tokens, and their buttons
  take the `strip-button-*` tokens. See `docs/theming.md` §3.

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
  arrow. If your toolbar adds actions, keep them distinguishable from these.
- **Size for the content people will put in it.** Umbraco's own preview page lays out badly below
  about 920px, so the preview asks for 920. A pane narrower than its content wants is a pane people
  pop out straight away.
- **A slow fetch can land after a newer one.** Count your requests and drop an answer that is not
  the latest, as the preview's `#fetch` counter does.

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

## 8. Checklist

- [ ] An element app with a per-feature `alias`, sensible `defaultSize` and `minSize`, and `props`
- [ ] Opened by a feature, from a control outside the titlebar, which toggles and shows as pressed
- [ ] Reads props in `connectedCallback` and fetches on connect
- [ ] Works as a pane and as a floating window, from `minSize.w` upward
- [ ] Holds no unsaved work
- [ ] Follows the owner by changes in `saves`, `changedElsewhere` and `dirty`, not by every emission
- [ ] Resizes itself with `setAttachedContentWidth`, if at all
- [ ] Has a way out when its content cannot be shown
- [ ] Tests for its pure rules, written first, and `npm run build` and `npm test` both pass
