---
id: reopening-windows
title: Reopening windows
description: Bring back the windows you had open after a reload, or after closing the browser.
sidebar_position: 4
---

# Reopening windows

After a reload, the desktop reopens the windows that were open:

- each one where it was and the size it was, pulled back into view if the screen is smaller now
- maximised, minimised or snapped to a half, as it was
- in the same order, with the same window in front
- each backoffice window at the page it was showing, such as a document, a media folder or a
  settings screen, rather than at its section's start page

The desktop waits behind its loading screen until the windows are back in place, so nothing appears
under the pointer once the desktop can be used. It does not wait for each window to finish loading:
those show their own spinner.

## Choose when windows come back

1. Open [Desktop settings](desktop-settings.md) and select **General**.
2. Under **Remember my open windows**, choose one:
   - **This session**, the default. Reloading the page, exiting and coming back, or signing in again
     in the same tab brings the windows back. Closing the tab forgets them. Each tab keeps its own,
     so two tabs never mix up their windows.
   - **Always**. Close the browser and come back tomorrow, and the windows are still there. A new tab
     starts from the layout changed last, whichever tab that was in.
   - **Don't remember**. The desktop starts empty every time and keeps nothing about the windows.

## What does not come back

By design:

- **Unsaved changes.** The desktop already asks before leaving with any, and a reload cannot bring
  them back. Plain Umbraco loses them on a reload too.
- **An app's own state.** Apps such as Minesweeper start fresh, with a new board.
- **Windows that can no longer be opened.** An app from a package that has been uninstalled, or a
  section your account has lost access to, is skipped and forgotten. The desktop gives a package
  five seconds to load its apps before deciding, so on a very slow connection a window from a slow
  package can occasionally be lost too. Reopen it from the launcher and it is kept again.
- **Attached windows.** A preview, or any other window attached to another, is left out for now.
  The window it belongs to reopens on its own.

## Where the layout is kept

The layout is kept in this browser, for your user, rather than on your Umbraco account. It changes
every time a window moves, so saving it to the server each time would be excessive for what is a
convenience, and a layout belongs to a screen anyway: one from a laptop is little use on a large
monitor. It is saved a moment after things stop moving, so a drag is one save rather than hundreds,
and straight away when the page is left.

Only the choice under **Remember my open windows** is on your account, with your other settings.
Switching to **Don't remember** forgets what was kept, and switching from **Always** back to **This
session** forgets the copy kept for the next visit.
