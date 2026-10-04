# Window progress — Design

> A window that is busy says so on its own chrome: a ring round its icon in the title bar and on its
> taskbar button, so a buried or minimized window still says it is working, and every route that
> would stop the work asks first.

- **Status:** Implemented
- **Date:** 2026-10-03
- **Issue:** [#108](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/108)
- **Mockup:** [`mockups/2026-10-03-window-progress.html`](mockups/2026-10-03-window-progress.html)

---

## 1. Where Umbraco's upload progress can be read

The issue says core's media collection context exposes "upload progress as an observable with a
completed and total count". That count exists, on `UmbDropzoneManager.progress`, but the manager is
owned by the dropzone element and is not a context.

**First design, abandoned:** read the media collection context's `placeholders`, one entry per
dropped item with a status and a percent, reached the way the dirty watcher reaches a workspace. Its
unit tests passed. In a real 17.7 backoffice it never reported anything, because in **17.7.0 and
18.2.0 the media collection element no longer subscribes to its collection context**: the private
field it calls `setPlaceholders` on is declared and never assigned, so the call is a no-op and the
list stays empty through a whole upload. 17.0 to 17.6 and 18.0 still subscribe. That is a core
regression (the grid's own upload tiles are gone with it), to be reported upstream separately.

**What is read instead:** the dropzone itself. `umb-dropzone-media` exposes `progressItems()`, the
upload manager's list of every file and folder in a drop, nested ones included. It is what the grid
reads, it works on every version checked, and it counts the files inside a dropped folder, which the
placeholders never did. The dropzone is not a context provider and its events stay in its shadow
root, so it is found by the context requests it sends as it connects (notifications, temporary file
config, media store), heard in the **capture** phase on the frame's document, where a provider cannot
stop them first. It is dropped when, on a later request, it is no longer connected: navigating always
connects new elements, and every one asks for contexts.

The manager's list keeps every item since the page loaded and appends each drop, so the watcher counts
only the batch in progress, from where the list stood when the dropzone was last idle.

## 2. Decisions

**D1. Task state lives beside `dirty`, summarised once.** The manager keeps each window's raw task
reports per source and writes one summary, `progress`, onto the window model. Every surface reads
the summary, so the title bar, the taskbar and the guards cannot disagree.

**D2. Summing rules** (`progress/progress.ts`, pure):

- Counts are summed across tasks: two uploads of 10 and 40 files are "14 of 50", one bar.
- Any running task without a known total makes the whole window indeterminate. A percentage that
  leaves out work it cannot measure is a false percentage, which the issue rules out.
- Running beats failed. The failed end state shows only once nothing is running.

**D3. Failure lasts as long as the source says so.** Chosen over latching it until the window is
looked at, or adding a dismiss control. For media that is until the next drop or until the window
navigates away from the dropzone; for an app, until it ends the task. No extra state, nothing new to
draw.

**D4. Upload items to a task.** `waiting` is running, and its per-file percent counts towards the
fraction so a single large file still moves. `error` and `not allowed` are failures. `complete` and
`cancelled` are finished. A folder is created at once and reports 100, so it is one quick item. A
failure lasts until the next drop starts a new batch, or until the dropzone goes away.

**D5. The app API is an event.** An element app dispatches a bubbling, composed `umbradesktop-task`
event with `{ id, state, completed?, total?, label? }`. Like the dirty attribute it needs nothing
imported from this package. An attribute was the alternative and was rejected: an attribute holds
one state per app, and the issue wants the desktop, not the app, to sum several tasks.

**D6. The base draws a ring round the app icon; themes restyle it.** The Umbraco theme is the base
chrome, so its drawing is the default: the window loader's turning arc round the icon, standing 2px
off the icon's box into the gap that is already there, so it costs no width. While the ring is drawn
the icon shrinks, by a scale derived from its size, the offset and the stroke, until its corners
clear the ring's inside edge, the way the loader's mark sits inside its ring. The first build stood
4px off an unscaled icon: the ring ran through the icon's corners and into the title text, which
Luuk saw in the running backoffice; four candidates were rendered there and this one chosen. The
shrink is a transform, so nothing beside the icon moves. The other themes
restyle the same element into their own idiom: Umbraco 4 a bevelled strip, macOS a hairline and
Finder's copy capsule, Windows 11 its green taskbar bar, Windows 98 the file transfer dialog's blocks
in a well set into the caption. Nothing changes a window's height, so no metric moves.

**D7. One element per surface, separate from the unsaved marker.** The unsaved dot keeps its slot
beside the title; progress sits on the icon. A window that is both busy and unsaved shows both.

**D8. Guards.** Close and reload ask when something is running, in the shape the unsaved guard uses.
A failed-only window closes without asking, since nothing is in flight. Exit and the language reload
add one sentence counting busy windows. The AI close tool skips busy windows as it skips unsaved ones.

## 3. Out of scope

- A docked pane reporting into its owner. Nothing in a pane does long work today.
- Cancelling from the chrome. Core's own tiles already cancel.
- The browser tab's own close. Unsaved changes are not guarded there either.

## 4. Verified in a backoffice

On a 17.7 test instance, by a puppeteer script dropping files into a Media window's own dropzone
input, with uploads throttled to 1.5 MB/s: 50 images ran 0 to 50 over 73 seconds with the fraction
only rising, the taskbar kept drawing it after the window was minimized, the marker cleared when the
work finished while still minimized, closing mid-upload asked and Cancel kept the window, and an
`.aspx` in a batch of two left "1 of 2 failed" standing after the batch. Every theme was then
rendered in every state from the same instance.

## 5. Traps found while building

Written up in [`docs/developer/window-progress.md`](../developer/window-progress.md#5-traps) as they
were hit: `instanceof` across the frame's realm, the 17.7 placeholders, the hidden macOS caption
icon, the failure rule losing the cascade, and the Windows 11 mark showing through the bar.
