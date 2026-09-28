# Reopening the windows you had open

When the desktop starts, reopen the windows the user had open when they last left it: after a page
reload, or on their next visit. Until now every start was an empty desktop.

## Decisions

### D1. The layout lives in the browser; the switch lives on the account

The window layout is kept in `localStorage`, per user (`umbradesktop:windows:<user>`), and never
written to the server (`windows/layout-persistence.ts`). It changes every time a window is moved,
resized, opened or closed, and writing that to `umbracoUserData` each time would be excessive for
what is a convenience for people who use the desktop regularly. A layout also belongs to a screen,
so one following the user from a laptop to a large monitor would not help.

This was first built the other way, with the account as the source of truth and the browser as a
cache, on the model of the desktop settings. It was changed before the pull request for the reasons
above.

The one part on the account is the choice: `reopenWindows`, stored with the other desktop settings
and so following the user, like every setting.

### D2. Per user, and tolerant of storage refusing

Keyed by user, as the settings cache is, so two accounts on one browser never reopen each other's
windows. When storage refuses (private browsing, blocked site data), reads return nothing and
writes report failure, so the desktop works and simply forgets its windows when it closes.

### D3. What is kept

Each ordinary window's app (by alias), rectangle, state (normal, minimized, maximized), snapped half
and the rectangle it returns to, stacking order, and whether it was active. For a backoffice window,
also the page its frame is on: the window follows its frame's router (`changestate`, and `popstate`
for back and forward) and records the path with query and hash (`UmbraDesktopWindow.location`).

The stored page is read back defensively twice: once when the layout is parsed, and again when it
becomes the frame's address (`restoredUrl`). It must be a path on this site whose first segment is
the app's own (`/umbraco/...`); anything else reopens the window at its app's start page. A stored
value, which anyone can edit in the browser's tools, can never point a window at another site.

### D4. Restoring waits for apps, up to a deadline

The catalogue delivers apps as their packages register, and a package's bundle can arrive after the
desktop is up. So a saved window waits for its app, and is restored the moment it appears; whatever
is still waiting after 10 seconds (`UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS`) is dropped: an
uninstalled package, or a section the user can no longer open. Windows are restored in stacking
order, without taking focus, and the one that was active is focused once at the end.

### D5. Nothing is saved until restoring has finished

Before then the open windows are a partial picture of the saved layout, and saving would overwrite
the whole one, so a window waiting for its package would be lost for good. The restored windows then
become the baseline, so the first update after a restore does not save a layout nobody changed.

### D6. Saves are debounced, and skipped when nothing kept changed

A second (`UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS`) after the last change, so a drag is one write even
to local storage, and none when nothing kept changed. There is no flush on unload, so a reload in
the second after a move can miss that move; the cost is small.

### D7. A setting, and opt-in

"Reopen my windows" in Desktop settings > General (`reopenWindows`), stored on the account with the
other settings. Off by default, so nobody's desktop changes behaviour until they ask for it. While
it is off the layout is still noted in the browser, so turning it on reopens the user's last visit
rather than an older one.

## Not in this version

- **Attached windows and panes.** Both belong to an owner by window id, and ids are minted fresh on
  every open. Restoring them means mapping owners across; the owner reopens on its own for now.
- **Unsaved changes, and an app's own state.** A reload cannot keep either; the desktop already warns
  before leaving with unsaved changes.

## Testing

- `windows/layout.test.ts`: what a snapshot keeps, the round trip, and every rejection on reading.
- `windows/layout-persistence.test.ts`: localStorage per user, and storage that refuses (D1, D2).
- `windows/layout-restorer.test.ts`: restoring in order with focus, waiting for a late app, dropping
  one that never arrives, not saving before the restore finishes, debouncing, skipping unchanged
  layouts, the setting off, and stopping.
- `window-manager.test.ts`: `restoreWindow` and `setLocation`.
- `components/window-location.test.ts`: a real same-site frame navigating as Umbraco's router does.
