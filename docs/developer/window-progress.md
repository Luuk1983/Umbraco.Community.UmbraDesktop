---
id: window-progress
title: Showing work in progress
description: Report work your app is doing so its window shows progress on its title bar and taskbar button, and how the desktop reads Umbraco's own uploads.
sidebar_position: 6.5
---

# Showing work in progress

A window that is doing something long, such as uploading fifty images, shows it on its title bar and
its taskbar button, and the desktop asks before anything closes it. Media uploads are shown with no
change to Umbraco. This page is for a package that wants its own app's work shown the same way, and
for anyone changing how the desktop reads Umbraco's.

The user's side of it is [Busy windows](../user/windows/busy-windows.md).

## 1. Report a task from your app

Dispatch an `umbradesktop-task` event from your app's own element. Start a task, update it as it
goes, and end it:

```ts
const report = (detail: object) =>
  this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));

report({ id: 'export', state: 'running', completed: 0, total: 40, label: 'Exporting' });
report({ id: 'export', state: 'running', completed: 12, total: 40, label: 'Exporting' });
report({ id: 'export', state: 'done' });
```

Nothing is imported from this package: the event name is a string, as the
[unsaved-work attribute](desktop-apps.md#7-lifecycle-what-happens-to-your-element) is.

| Field | What it is |
| --- | --- |
| `id` | Your name for the task. A report with the same `id` replaces the last one |
| `state` | `running` while it goes on, `failed` when it ended and not everything worked, `done` to end it |
| `completed` | How much is done, in the units of `total`. May be fractional, so half a file is `0.5` |
| `total` | How much there is to do. Leave it out when you do not know, and the window shows activity rather than a percentage |
| `failed` | How many items failed, for the caption "3 of 40 failed" |
| `label` | What the work is, as text or a `#key` for the backoffice's localizer. Shown as "Exporting 12 of 40" |

**Several tasks are summed by the desktop**, so report each piece of work as it is rather than
averaging them yourself. Two tasks of 10 and 30 show as one window at "of 40". If any running task
has no `total`, the whole window shows activity, because a percentage that leaves out work it cannot
measure reaches the end too soon.

**A failure stays until you end it.** Send `failed` when the work ends badly, and the window keeps the
failed state, in the failure colour with the count in the tooltip, until you send `done` for that
`id`. Clear it when the user has seen it, for example when they start the next run.

**Your tasks go with your app.** When the window closes, or another app is mounted in its place, every
task it reported is dropped. A report that is not one of these shapes is ignored.

The event stops at the window, so nothing outside it hears it.

## 2. What the desktop does with it

Everything the unsaved-work attribute gets, from the same places:

- the progress on the title bar and the taskbar button, in the active theme's own drawing
- a question before **Close** or **Reload** stops the work, which says what the window is doing
- a count of busy windows in the prompt before someone leaves the desktop
- the AI assistant's close tool leaving the window open

A window that is busy and unsaved shows both, and closing it asks once.

## 3. How Umbraco's uploads are read

Media uploads are not reported by anything. The desktop reads them from the frame, in
`backoffice/src/desktop/progress/upload-watcher.ts`.

A media dropzone, `umb-dropzone-media`, exposes `progressItems()`: its upload manager's list of every
file and folder in a drop, each with a status and a percent. That is what Umbraco's own media grid
reads for its upload tiles. The watcher finds a dropzone by the context requests it sends as it
connects. A dropzone provides no context and its own events stay inside its shadow root, but a
`umb:context-request` is bubbling and composed, so a listener in the **capture** phase on the frame's
document hears it before any provider stops it. Anything that asks for a context and has
`progressItems()` is a dropzone.

The manager's list keeps every item since the page loaded, so the watcher counts only the batch in
progress, from where the list stood when the dropzone was last idle.

## 4. Theming it

The base drawing is the window loader's ring round the app's icon. A theme restyles the same element,
`.progress`, which carries its state on `data-state` (`determinate`, `indeterminate` or `failed`) and
its fraction on `--umbradesktop-progress-value`, from 0 to 1. It sits in `.progress-anchor`, the
wrapper round the icon, on both surfaces. While the ring is drawn the icon inside it shrinks, by a
transform derived from the icon's size (`UMBRADESKTOP_CHROME_ICON_PX`), so its corners clear the ring;
a theme drawing a strip with `progressStrip` keeps the icon at full size.

To draw a bar instead of a ring, interpolate `progressStrip` from `progress/progress-view.ts` into your
sheet for that surface, with where the bar sits and how thick it is:

```ts
${progressStrip('.titlebar', { height: 2 })}
${progressStrip('.task', { height: 3, inset: 'auto 2px 2px 2px' })}
```

Colour it from your palette with `--umbradesktop-titlebar-progress-fill`, `-track` and `-failed`, and
the same three for `taskbar`. The shipped themes are the worked examples: Umbraco 4 draws a bevelled
bar, macOS a hairline and Finder's copy capsule, Windows 11 its green taskbar bar, and Windows 98 the
file transfer dialog's blocks in a well in the caption.

## 5. Traps

**Never test a frame's element with `instanceof`.** A window's content is an iframe, which is another
realm with its own `Element`, so `node instanceof Element` is false for every real element in it. The
first upload watcher did that, passed every unit test in the test page's single realm, and found
nothing in a real backoffice. Test by shape, and keep a test that builds its element in an iframe.

**Umbraco 17.7 and 18.2 never fill the media collection's `placeholders`.** The collection context
still has them, but the collection element stopped subscribing to the context, so nothing writes to
them and they stay empty through a whole upload. That was this feature's first source, and it worked
on 17.6. Read the dropzone instead, as above.

**If your theme hides the app icon, the base ring goes with it.** macOS hides the caption icon, so
its title bar has to draw a strip. `theme/progress.test.ts` renders every theme and fails one whose
progress collapses to a speck.

**A failure needs its own background, not a reassigned fill.** The surfaces set the fill in a later
rule of the same specificity, so a `failed` rule that only reassigns the fill variable loses, and the
failure draws exactly like progress. `progressStrip` already does this.

**Do not draw a bar over a mark that is already there.** On Windows 11 the focused window's blue
running mark showed either side of the green bar until the theme hid the mark while the bar is
drawn, which is also what Windows itself does.

**Uploads on localhost finish faster than anyone can see.** Fifty 2 MB images uploaded in about a
second against a local backoffice. To watch the progress, throttle the upload in the browser, for
example with `Network.emulateNetworkConditions` in a puppeteer script.
