# Dragging media between windows, and pasting a screenshot: spike findings

> Four browser-level unknowns, answered in a real Chrome rather than from confidence. No product
> code was written and nothing in the package changed. The harness was thrown away once the answers
> were recorded here, so this file is the whole record.

- **Status:** Spiked 2026-09-29. All four questions answered yes, and the feature was **parked**
  anyway. Kept because what the browser will and will not do does not expire, and because the next
  person to want any of this should start from here rather than from a blank page
- **Date:** 2026-09-29
- **Branch:** `media-spikes`
- **Harness:** deleted after the run. It was a parent page with two same-origin iframes served over
  http from a throwaway localhost server, driven through `puppeteer-core`
- **Browser:** Chrome 154, headless, driven through `puppeteer-core` (already present as a
  transitive dependency of `@web/test-runner`, so the spike needed no install)
- **Related:** the remote content viewer spike on `worktree-remote-content-viewer`, which proved the
  frame-and-proxy route and, incidentally, that a remote instance's media library and its thumbnails
  render inside a frame

---

## 1. What was asked

A desktop window's body is an iframe, so every question about dragging between windows is really a
question about dragging between two same-origin iframes of one page. The harness is therefore a
parent page with two frames, served over `http` from a throwaway localhost server. That last detail
is not incidental: over `file://` each frame gets an opaque origin, which would answer question B
"no" for a reason that has nothing to do with the desktop.

| # | Question | Answer |
| --- | --- | --- |
| A | Does a drag started in one frame deliver a drop in a different frame, payload intact? | Yes |
| B | Can the top document reach into the receiving frame at the drop point, set a property on the element it finds, and have that element's own listener fire? | Yes |
| C | Does a paste hand a non-editable grid a real image file? | Yes |
| D | Can the drag carry enough to describe a remote item, or must it be an id we look up? | It can carry plenty |

## 2. What the spike found

**A. Drag crosses frames.** `dragstart` fired in frame A, `dragover` fired twice in frame B, `drop`
fired, and both data types arrived. This holds whether the drop lands on a plain drop zone or on an
element pretending to be a picker.

**B. The picker mechanism works.** On drop, the top document took the drop coordinates, subtracted
the frame's own rectangle, called `elementFromPoint` inside the frame, walked up to the nearest
picker, set a property on it and dispatched a `change` event constructed in *that frame's* realm.
The picker's own listener fired and saw the new value. The negative control matters as much: the
same call over the plain drop zone correctly found no picker and reported what was under the point
instead.

**C. A grid can be pasted into.** The paste reached the document with a non-editable `div` focused,
carrying `items: [{kind: 'file', type: 'image/png'}]` and a readable `File`. The first eight bytes
came back as the PNG magic number, so the bytes are genuinely there and an upload can be built from
them. Pasting onto a `contenteditable` behaves identically, so the grid does not need to pretend to
be editable.

**D. The payload is roomy.** A 4,218 character JSON payload survived the crossing unchanged, which
is far more than an id plus which connection it came from. So a tile dropped into another window can
be drawn immediately from the payload, without a round trip, and a remote item can say where it came
from.

## 3. Traps worth knowing before building

- **`headless: 'shell'` refuses the clipboard.** The first run failed with
  `NotAllowedError: Write permission denied` from `navigator.clipboard.write`, and puppeteer's
  `overridePermissions` did not help. Full headless plus a direct CDP
  `Browser.grantPermissions` with `clipboardReadWrite` works. That is a property of the test browser,
  not of the feature, and it will cost someone an afternoon if it is not written down.
- **On a paste, `clipboardData.types` is empty while `items` and `files` are populated.** Read
  `items` or `files`. A guard written against `types` sees nothing and silently does nothing.
- **Chrome names every pasted image `image.png`.** Not blank, which would be obvious, but the same
  name every time. Paste ten screenshots and the library holds ten items called image.png. The
  feature has to generate a name, and that is a product decision, not a detail. **Decided: the name
  is `image` plus the date and time.** Write it sortable and with nothing a file system objects to,
  so `image-2026-09-29-142317`, not a colon or a locale-formatted time. The date is the one thing
  an editor actually knows about a screenshot they just took.
- **During `dragover` the type list is readable but the data is not.** That is by design in the
  spec, and it is the reason for a custom MIME type: a drop target can only decide whether to accept
  a drag from the type list, so the type has to carry the meaning.
- **The grid must be focusable** for a paste to reach it. It needs a `tabindex`, and a paste is only
  ours when our view actually has focus.
- **A drag cannot be started from synthetic mouse events.** A real drag is an OS-level operation.
  Any automated test of this needs puppeteer's drag interception, which keeps the whole drag inside
  the browser while still producing a real `dragstart` and a real `DataTransfer`.

## 4. There is more than one media picker, and they disagree

This is the one finding that changes the shape of the feature.

The standard **Media Picker** property editor does not use `umb-input-media`. It renders
`umb-input-rich-media`, whose value is an `Array<UmbMediaPickerPropertyValueEntry>`, and its change
handler reads `event.target.value` as an array. `umb-input-media` is a different element with a
different contract: a `selection` of ids and a `value` that is a comma-separated string.

So "drop onto any applicable media picker" is not one drop handler. It is a small adapter per input
element, each knowing that input's value shape, with anything unrecognised declining the drop rather
than guessing. That also gives the feature a natural boundary: an input we have no adapter for
simply does not light up, which is a visible no rather than a silent corruption.

## 5. Keyboard shortcuts: Umbraco already has the framework

Read from the source rather than spiked, but it settles how paste should be wired.

`@umbraco-cms/backoffice/shortcut` has `UmbShortcutController`, and a shortcut is
`{ key, modifier, shift, alt, label, weight, action }`. Three things about it matter here:

- **`modifier` is already cross-platform.** The controller reads `e.metaKey` on a Mac and
  `e.ctrlKey` everywhere else, so Cmd+V and Ctrl+V are one registration, not two.
- **It listens on `window` and calls `preventDefault` on a match.** Inside the desktop each window
  body is its own frame with its own `window`, so a shortcut registered by a view only fires while
  that window has focus. That is the behaviour a desktop wants, and it comes for free.
- **It can be provided at a host and activated or deactivated.** Core's view controller already does
  exactly that, so a collection view can own its shortcuts and have them live only while it is the
  active view. Core's own comment says shortcuts are "not implemented yet", so there is no
  established set to collide with, and also no precedent to copy.

### 5.1 Copy and cut do not mean the same thing for media

Worth settling before anything is built, because the obvious reading is wrong.

**Cut then paste is a move, and it is fully supported.** `PUT media/{id}/move` exists.

**Copy then paste is a duplicate, and there is no API for it at all.** Documents have
`POST document/{id}/copy`; media has no equivalent, which was confirmed against the generated
client. Implementing it would mean downloading the bytes and uploading them again, producing a
byte-identical second file. That is precisely the thing the library already suffers from, so the
feature would be making the problem it is meant to relieve.

So for media, copy should mean **copy a reference**, for pasting into a picker or a document, and
never duplicate the file. That is the same payload the drag already carries, which keeps one
meaning for one gesture.

### 5.2 One key, two meanings, and the rule that separates them

Ctrl+V has to mean both "upload what is on my operating system's clipboard" and "place the media
item I just copied inside Umbraco". Both are legitimate and both target the folder in view.

Do not register Ctrl+V as a shortcut. Handle everything in the `paste` event, which fires for the
keystroke whatever the clipboard holds, and branch on what arrived:

- `clipboardData.files` is non-empty → it is an upload.
- Otherwise → consult Umbraco's own clipboard and place or move the reference.

That ordering is deterministic and avoids the trap of registering the same key twice: `keydown`
fires before `paste`, so a shortcut action would have to decide before it can know whether files are
coming.

## 6. What is still unproven

- A real `umb-input-rich-media` inside a real content window. The mechanism is proven against a
  stand-in; the contract is read from the element's own typings. Mounting the real one needs a
  running backoffice.
- Whether the property editor marks the workspace dirty from a programmatic change. It raises
  `UmbChangeEvent`, which is the right signal, but that was not observed end to end.
- Pulling a file from a connected instance. Deliberately out of scope here: it waits on the remote
  content viewer.
- Anything about large files. The payload test was 4KB of JSON, not a 2GB video.

## 7. What this means, and why it was parked anyway

Every browser-level answer is yes. Dragging media between two desktop windows works, the drag
carries enough to describe what is being dragged, dropping onto a picker in another window works at
the cost of one adapter per picker type, and pasting a screenshot into a folder works.

What stopped it was above the browser. To drag a media tile you have to own the tile, which means
our own collection view. To have that view actually be in front of anyone you have to be the
collection's default view, and the media collection pins core's grid as its default in code, chooses
the view by route so it resets on every folder navigation, and remembers nothing about what the user
picked. The only supported lever is `overwrites` on core's grid, which replaces the media grid for
the whole site and obliges the replacement to reach parity with core's first: selection, bulk
actions, the dropzone, the entity actions on each tile.

So the cost was never the drag. It was owning the media section in order to earn the right to start.
That is the thing to re-examine if this is ever picked up: a remembered collection view, or a
supported drop target on the pickers, would each remove it.
