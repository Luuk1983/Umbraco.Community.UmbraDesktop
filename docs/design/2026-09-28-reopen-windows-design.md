# Reopening the windows you had open

When the desktop starts, reopen the windows the user had open: after a page reload, after Exit and
back, and, if they ask for it, on their next visit. Until now every start was an empty desktop.

Revised 2026-09-29 after review. The first version was one opt-in switch backed by `localStorage`;
it is now three choices with a session default, and the desktop holds while windows reopen. D1, D4,
D6 and D7 changed and D8 is new.

## Decisions

### D1. Three choices, and "This session" is the default

`reopenWindows` in Desktop settings > General ("Remember my open windows") is one of:

- `off`, shown as "Don't remember": nothing about the windows is kept anywhere.
- `session` (default), shown as "This session": after a refresh, Exit and back, or signing in
  again in the same tab.
- `persistent`, shown as "Always": also after the browser has been closed.

The labels name the scope in words an editor already has from browsers, rather than the mechanism;
the first wording ("After a refresh", "Also after closing the browser") read as unclear to editors
in review. "This session" stretches slightly, since signing out and in again in the same tab still
counts, and the hint under the select says what it covers.

"This session" is the default rather than opt-in because nobody expects F5 to close everything
they had open, and a browser does not do that to its own tabs either. Keeping windows across
visits is the opt-in, because it means a new tab tomorrow opens with yesterday's work.

"Don't remember" is kept although almost nobody will want it: with "Always" on, every fresh tab
seeds from the browser's copy (D2), and somebody who opens the backoffice in several tabs for
different jobs should be able to turn all of it off. The choice is stored on the account with the
other settings, so it follows the user. The layout itself never does.

### D2. The tab's copy is the working copy; the browser's is only a seed

The layout is kept per user (`umbradesktop:windows:<user>`) in two places with different jobs
(`windows/layout-persistence.ts`):

- **`sessionStorage`** is the working copy in both `session` and `persistent` mode. Every save goes
  there and every load reads it first, so F5 brings back exactly this tab, and two tabs never
  overwrite each other while somebody works.
- **`localStorage`** is written as well in `persistent` mode, and read only by a tab that has no
  working copy yet: a tab opened after the browser was closed, or a second tab. Any tab can
  overwrite it, so it holds whichever tab changed its layout last. That does not matter, because
  nothing reads it once a tab has its own copy.

Keyed on "this tab has no copy yet" rather than on signing in, because the desktop cannot reliably
tell a fresh sign-in from a reload, and the tab test covers every case correctly: F5 and Exit keep
the tab's copy, a new browser session has none, signing in again in the same tab keeps the tab's
copy (which is newer anyway), and Chrome restores `sessionStorage` along with the tabs it reopens.

Never on the account: the layout changes every time a window moves, which is a stream of writes a
convenience does not justify, and it belongs to a screen, so one from a laptop is little use on a
large monitor. This was first built with the account as the source of truth and changed before the
pull request for those reasons.

Storage that refuses (blocked site data, some private modes) reads as nothing kept and writes
nowhere. Where site data is blocked even reading `window.localStorage` throws, so the store is
handed functions that reach each storage, called inside its own `try`.

### D3. What is kept

Each ordinary window's app (by alias), rectangle, state (normal, minimized, maximized), snapped half
and the rectangle it returns to, stacking order, and whether it was active. For a backoffice window,
also the page its frame is on: the window follows its frame's router (`changestate`, and `popstate`
for back and forward) and records the path with query and hash (`UmbraDesktopWindow.location`).

The stored page is read back defensively twice: once when the layout is parsed, and again when it
becomes the frame's address (`restoredUrl`). It must be a path on this site whose first segment is
the app's own (`/umbraco/...`); anything else reopens the window at its app's start page. A stored
value, which anyone can edit in the browser's tools, can never point a window at another site.

### D4. Restoring waits for apps for five seconds, then forgets the rest

The catalogue delivers apps as their packages register, and a package's bundle can arrive after the
desktop is up. So a saved window waits for its app and is restored the moment it appears. Whatever
is still waiting after 5 seconds (`UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS`) is given up on, and the
restored layout is saved at once without it, so the next load does not wait for it again.

Five rather than ten (the first version) or two (considered in review) because the two ways of
getting it wrong are not equal. Too short, and a package that is only slow, a slow connection is
enough, loses its window on every load. Too long only costs anything when an app has gone for good
(an uninstalled package, a section the user lost access to), and then only once. Normally every app
is already known and the restore is instant whatever the number is.

Windows are restored in stacking order, without taking focus, and the one that was active is
focused once at the end.

### D5. Nothing is saved until restoring has finished

Before then the open windows are a partial picture of the saved layout, and saving would overwrite
the whole one, so a window waiting for its package would be lost for good. When the restore
finishes, the restored layout is saved straight away (D4) and becomes the baseline, so the first
update after it does not save a layout nobody changed.

### D6. Saves are debounced, skipped when nothing changed, and flushed when the page goes

A second (`UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS`) after the last change, so a drag is one write, and
none when nothing kept changed. A save still waiting when the page is hidden (`pagehide`) goes out
at once. The first version had no flush and accepted losing a move made in the second before a
reload; with F5 now the main case, that was the wrong trade.

### D7. A change of mode applies at once to where the layout is kept

Switching to `off` forgets both copies and stops saving. Switching to `session` forgets the
browser's copy. Switching to `persistent` writes the browser's copy straight away rather than at
the next move. Whether windows come back is decided on the next load; the ones open now stay open
either way.

### D8. The desktop holds while windows reopen

Nobody should start using a desktop that windows are still appearing on. So the desktop keeps its
first paint back until the restore has finished, with the same neutral hold it already shows while
settings load (`reportWindowsRestoring` beside `reportSettingsLoaded`), and the boot splash stays up
over it when there is one. A restore that runs past the boot's usual 1.5 second floor puts
"Reopening your windows" on the splash, through the same delayed status the settings load uses.

Only the placing of windows is waited for, never their frames. Every restored backoffice window is a
full backoffice booting, several at once on a busy desktop, and waiting for them would make the
desktop look slow. Each window already has its own loader, the same mark and ring as the splash, so
windows still loading read as intended.

The hold covers every way in: the splash is up on any load that lands on the desktop, which includes
F5, and entering from the classic backoffice shows the neutral hold instead. The restoring flag goes
up in the same tick as the settings report, so the desktop never gets a usable frame in between.

## Not in this version

- **Attached windows and panes.** Both belong to an owner by window id, and ids are minted fresh on
  every open. Restoring them means mapping owners across; the owner reopens on its own for now.
- **Unsaved changes, and an app's own state.** A reload cannot keep either, and Umbraco does not
  either: a session timeout keeps your place only because Umbraco signs you in again over the page
  without reloading it. Keeping edits across a reload would mean reading values out of every
  property editor inside each frame and writing them back, the coupling that ruled out remote
  editing. The desktop already warns before leaving with unsaved changes.

## Testing

- `windows/layout.test.ts`: what a snapshot keeps, the round trip, and every rejection on reading.
- `windows/layout-persistence.test.ts`: the tab's copy before the browser's, seeding a fresh tab,
  each mode's writes, forgetting what a mode does not keep, per-user keys, refusing storage (D1, D2, D7).
- `windows/layout-restorer.test.ts`: restoring in order with focus, waiting for a late app, dropping
  one that never arrives and saving without it, not saving before the restore finishes, debouncing,
  the `pagehide` flush, saving on request, and stopping (D4 to D6).
- `windows/layout.controller.test.ts`: the restoring flag from the settings report to the end of the
  restore, the splash status, each change of mode, and saving again after the desktop is put back
  (D7, D8).
- `components/desktop-boot.test.ts`: the hold and the splash waiting for the restore (D8).
- `window-manager.test.ts`: `restoreWindow` and `setLocation`.
- `components/window-location.test.ts`: a real same-site frame navigating as Umbraco's router does.

## Notes from the build

- Exit and back builds a new desktop element; measured in a real backoffice, the element after
  coming back is not the one that left. So "This session" covers Exit the same way it covers F5:
  the new desktop reopens from the tab's copy, behind the hold. The controller still writes what is
  pending when its desktop disconnects, and resumes saving without reopening anything if the same
  element is ever connected again, since the app catalogue's `hostConnected` allows for that too.
- Measured end to end on the test instance (headless Chrome): after F5 both windows came back at
  their rectangles, the backoffice window at the page its frame had moved to, and a move made just
  before the reload was kept by the `pagehide` flush. The splash lifted at 3.1 s with both windows
  already placed and their frames still showing their own loaders.
