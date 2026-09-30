# Desktop notifications: design

> A notification raised anywhere on the desktop is shown once, by the desktop, instead of once in
> every window that happened to raise it. The shell takes Umbraco's toast channel over: it watches
> every window's notification context, hides the toasts inside the window, and draws its own. The
> taskbar clock opens a scrollback of the last twenty, and carries a dot while a warning or an error
> is in it. The list can be cleared.

- **Status:** Implemented and verified in a browser 2026-09-27, under all five themes. What the build
  taught is in §8. Two of the issue's decisions were reversed after Luuk used it, D6 and D7
- **Date:** 2026-09-27
- **Branch:** `claude/github-issue-72-16cd6a`
- **Issue:** [#72](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/72). The issue
  is the specification; this records the three gaps the build had to fill and how the parts fit
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Umbraco has no installation-level message channel, so a package announces things by raising a toast
in the backoffice it is running in. A window is a backoffice. Five windows means Deploy's license
warning five times, plus once on the desktop. The issue's Description has the full case and its
decisions list (no classification, no read state, no dismiss, everything goes to the desktop) is not
repeated here.

**Out of scope:** docked panes. A pane's frame is not watched, so a notification raised in one still
shows inside the pane. Today the only pane is the preview, which is the site and not the backoffice,
so it has no notification container to take over. Floating attached windows are ordinary windows and
are watched like any other.

## 2. Settled decisions

| # | Decision |
| --- | --- |
| D1 | A repeat is the same severity, headline and message. Which window raised it is not part of it |
| D2 | The toasts inside a watched window are hidden one by one, not the whole container |
| D3 | An entry whose window no longer exists does nothing when clicked |
| D4 | A timed desktop toast runs its own timer. A staying one also closes when its sender closes it |
| D5 | Entries hold plain data. What a click re-raises through is a live source, looked up by window |
| D6 | The list can be cleared, by one Clear button, and the toasts showing go with it. Reverses the issue's "no clearing" |
| D7 | The clock carries a dot in the worst severity held, not a number. Replaces the issue's count |

## 3. Gaps the issue left

### 3.1 What counts as a repeat (D1)

The issue says the same message raised in five windows appears once, and that a repeat folds into
the entry it repeats. If the source window were part of an entry's identity those two would
disagree: five windows would be five entries. So identity is severity plus headline plus message,
and the entry records the window that raised it most recently. That is also the window a click
focuses, which is the one most likely to still be open.

The same rule applies to toasts on screen. A repeat that arrives while its toast is still showing
refreshes that toast (its count, its window, its timer) rather than stacking a second one.

### 3.2 Hiding toasts rather than the container (D2)

The issue suggests suppressing `umb-backoffice-notification-container`. That cannot satisfy the
criterion that clicking a notification carrying its own element re-raises it in its source window
where its actions are usable: a hidden container hides the re-raised toast too.

So the injected rule goes into the container's own shadow root and hides every
`uui-toast-notification` that does not carry the desktop's re-raised attribute. The one the desktop
re-raises is marked before it renders and shows as normal.

This also settles the issue's open question about the top layer. The container's popover is never
hidden, only its children, so there is no question of a top-layer element surviving `display: none`.
A hidden toast still runs its own lifecycle: its open and close sequence is `setTimeout` and
`requestAnimationFrame`, neither of which cares about `display`, so it closes on schedule, fires
`closed`, and leaves its context's list exactly as it would have. A sender awaiting `onClose()` sees
the same timing as before.

### 3.3 Clicking after a reload (D3)

Windows do not survive a reload of the desktop and the scrollback does, so after a reload every entry
names a window that is gone. Clicking one does nothing. Reopening an app to show a message would be
guessing which document the message was about.

## 4. How it fits together

```
window frame ─┐                                     ┌─> desktop toasts
desktop's own ├─ notification watcher ─> centre ────┤
backoffice ───┘   (one per document)   (context)    └─> scrollback (clock)
```

- **`notifications/read-handler.ts`** turns one of core's `UmbNotificationHandler`s into plain data.
  It is the only place that reads the handler's private `_data` and `_elementName`, and its test
  builds a real handler so an Umbraco upgrade that renames either fails loudly.
- **`notifications/notification-watcher.ts`** watches one document. It polls for the container the
  way `injectChromeStyles` polls for the shell, asks that element for `UMB_NOTIFICATION_CONTEXT`
  (a descendant of the provider, so the request travels the right way), subscribes, and only then
  injects the hiding rule. Observe first, suppress second, as the issue decided. Every handler it has
  not seen before is reported once, including the ones already on screen when it subscribed, which
  therefore move from the window to the desktop rather than vanishing.
- **`notifications/scrollback.ts`** is the pure model: fold a notification into the list, cap it at
  twenty, count the warnings and errors, read and write `sessionStorage`.
- **`notifications/notification-centre.context.ts`** is provided by the desktop. It holds the live
  toasts and the scrollback, persists the scrollback, and takes clicks. Windows register themselves
  as sources on load, so a click focuses the window through the window manager and, for a
  notification carrying its own element, asks that window's current watcher to raise it again (D5).
- **`components/desktop-toasts.element.ts`** draws the stack. **`components/scrollback.element.ts`**
  draws the list behind the clock.

The desktop watches its own document too, from connect to disconnect, so a notification raised by the
desktop itself arrives the same way and the hiding rule is lifted when you leave the desktop.

## 5. Theming

New tokens, all falling back to existing ones so a theme that sets none still draws something that
belongs to it:

- `--umbradesktop-toast-*` for the toast surface. It falls back to the launcher's surface tokens,
  because a toast is a small panel over the desktop, and the launcher is the panel each theme has
  already drawn. The severity edge reads the existing `--umbradesktop-notice-*-color` tokens, plus a
  new `--umbradesktop-toast-positive-color` for successes, which the notice strip never needed.
- `--umbradesktop-toasts-top`, `-bottom`, `-left`, `-right` and `-direction` place the stack. The
  default is bottom-right above the taskbar reserve, growing upwards. A theme with a menu bar sets
  `top` and `direction: column` and the stack hangs under it.
- The scrollback panel reuses the launcher's surface tokens outright and adds only its gap above the
  bar (it hangs from the clock horizontally, measured, see §8), its
  radius, and `--umbradesktop-scrollback-hover-text` for Windows 98, whose launcher hover fill is the
  navy selection bar and needs white text with it.
- The clock's dot is the unsaved dot's size (`--umbradesktop-notice-marker-size`) in the notice
  severity colours, so it needs no token of its own.

## 6. Tests, written first

- The handler reader against a real `UmbNotificationHandler`: message, headline, colour, duration,
  `stay` as no duration, and a custom element name carried with its data.
- The scrollback: folding, count and last-seen, moving a repeat to the top, the cap, the attention
  count falling as entries roll off, and a round trip through storage including corrupt storage.
- The watcher: nothing hidden before the context answers, hidden after; handlers reported once;
  a re-raised handler shown and not reported again; stopping lifts the rule.
- The centre: one toast and one entry for the same message from two windows; clicking focuses and
  re-raises; a second centre over the same storage sees the first one's entries.
- The toast stack and the clock: a toast closes after its duration and a staying one does not; the
  clock shows the dot and opens the scrollback, and Clear empties it.

## 7. Considered and dropped

- **Hiding the whole container.** Simpler, and breaks the re-raise. §3.2.
- **Following the frame's own toast lifecycle for timed toasts.** The hidden frame toast closes at
  its duration whether or not somebody is hovering the desktop's copy to read it, so a desktop toast
  that followed it would close under the pointer. Only a staying toast follows its sender (D4),
  because that is the one a sender closes on purpose.
- **Keeping a re-raise closure in the entry.** It would hold the frame's context, which closes over
  the frame's realm and outlives the window. The dirty watcher learned this first. D5.

## 8. Notes from the build

- **Verified in Chrome against the real backoffice**, two section windows and the desktop's own
  document, 21 checks: the toast inside a window is `display: none` at zero height while the
  container's popover stays `:popover-open`, so the top-layer question never arises; the same warning
  from two windows is one toast marked ×2; a peek-error clicked on the desktop restores its minimized
  window and shows again inside it with its Full Error Message button; the scrollback and the count
  survive a reload and the entries whose windows went are drawn disabled; the stack clears the
  taskbar or dock under every theme.
- **Clicking an entry raises it again as staying**, not with its original duration, which the entry
  does not keep. Somebody clicked it to use it, and a six-second timer would take it away again.
- **Umbraco's `icon-remove` is a bin.** The toast's close button draws the same cross the window's
  own close control does.
- **The scrollback hangs from the clock, measured, and the toasts stand aside while it is open.** It
  first sat a fixed offset from the screen's trailing edge, which is where the clock is under four
  themes and not under macOS, whose clock is at the end of a centred dock: the list opened well away
  from the button that opened it. The fixed offset was also what the list and the toasts had to share
  so the panel covered them exactly; four pixels apart, the toasts' edges showed down its side.
  Hiding the toasts while the list is open, as Windows does behind its notification centre, removed
  that coupling rather than preserving it.
- **Tests that wait on the watcher's poll need a long `waitUntil`.** The runner backgrounds pages when
  several files are in flight, and a background page's `setInterval` is throttled to once a second,
  so the default one-second wait passed alone and failed in the full run.
- **A bare `UmbElementControllerHost` provides nothing until `hostConnected()` is called**, which an
  element host gets from the DOM. A test that builds the centre on one has to call it.
- **Still open, from the issue:** whether the clock's dot should be quieter than #22's health
  indicator. A dot is already the quieter of the two shapes the issue had in mind, but #22 is not
  built yet, so the comparison is for whichever of the two ships second.

## 9. Reversed after use

Both came from Luuk looking at the built thing on 2026-09-27, and both reverse a **[decided]** line in
the issue.

**The dot (D7).** The issue asked for a count of the distinct warnings and errors. Every operating
system that puts a number by its clock means something else by it: Windows 10 and 11 and KDE show an
unread count that clears when the list is opened, and macOS shows nothing by the clock at all, only
per-app badges in the Dock. Our list has no read state by design, so a number there read as an unread
count that never cleared. GNOME puts a dot by its clock for exactly the job this does, "something in
here is worth a look", and that is what replaced it. The accessible name still says so in words.

**Clear (D6).** The issue ruled out clearing the count by hand, on the grounds that the count was not
an unread count and so had nothing to be reset from. In use, that left a list that had been read with
no way back to empty: the dot stayed up until twenty other messages pushed the last warning off. One
Clear button in the list's header empties it, and takes any toast still showing with it, since a
toast is the same notification as its line. There is still no per-entry dismiss, no read state and no
muting; this is one reset, not a triage tool. The button is drawn disabled on an empty list rather
than hidden.
