---
id: media-manager
title: Media Manager
description: Your media library in desktop windows, with dragging, copy and paste, files from your computer, transfers and undo.
sidebar_position: 1
---

# Media Manager

The Media Manager shows your media library in desktop windows, one folder per window. Inside each
window is Umbraco's own media library: the same folders, cards, list, filter, Create, uploads and
item menus as in the Media section, including anything other packages add there. The Media section
itself stays as it is.

## Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Media
```

Media Manager then appears in the launcher's **Media** group, for everyone who may use the Media
section.

You see and change the same media as in the Media section. If your user group has media start
folders, **Media** shows those folders, and you cannot put anything outside them: a drag, a paste
or an upload there says **You have no access to this folder**. A window last open on a folder you no
longer have opens on **Media** instead.

## Folders and windows

Each window shows one folder, and is named after it on its title bar and taskbar button.
The tree beside it shows your folders, and only folders: what is in a folder shows in the window.
The folder the window shows is highlighted in the tree, and the tree opens down to it. A folder has
an arrow when there are folders inside it. **Recycle Bin** says how many items are in it.

- To open a folder in the window, click it, on its card or in the tree.
- To open a folder in a new window, select **Open in new window** in its menu, or middle-click it.
  In the tree, holding Ctrl (Cmd on a Mac) and clicking it does the same.
- To open another window at Media, open **Media Manager** from the launcher again.
- To go back to the top, click **Media** at the top of the tree.
- To see what is in the recycle bin, click **Recycle Bin** at the foot of the tree. Restore, delete
  and empty it with Umbraco's own actions there.

Create and uploads put new items in the folder the window shows.

## Items

An item opens beside its window, in Umbraco's own editor: in a pane inside the window when there is
room, and in a window of its own, grouped with it, when there is not. Each window has one item open
at a time. Its card has a pink border, so you can see which one it is while you select others.

- To open an item, select it.
- To open an item in a window of its own, hold Shift and select it.
- To open another item, select it. The pane switches to it. If you have unsaved changes, Umbraco asks
  first, and you can stay.
- To move the item between the pane and a window, select **Pop out** in the pane's header or
  **Dock** in the window. Save or discard your changes first: both are greyed while you have some.
- To create an item, select **Create** in the toolbar, or **Create** in a folder's menu, and choose a
  type. It opens beside the window, in the folder, and its card appears once you save it.
- To create a folder, select **Create**, then **Folder**. Type its name and select **Create**. It
  appears in the window and in the tree, selected.

Closing the pane or the window asks first when the item has unsaved changes.

## Selecting

Select items to work on several at once, with Umbraco's bar at the bottom of the window. While
anything is selected, selecting an item adds it rather than opening it, as in the Media section.

- To select an item, select its checkbox, or hold Ctrl (Cmd on a Mac) and select it.
- To select a range, select the first item, then hold Shift and select the last.
- To select items by dragging, drag from empty space between or around the cards. Every card the box
  touches is selected. Hold Ctrl (Cmd on a Mac) to add to what is already selected.
- To select everything in the window, press Ctrl+A (Cmd+A on a Mac). To select nothing, press Esc,
  or click empty space in the window.

## Cut, copy and paste

Move and copy items between folders and windows as you would files. A copy is a new media item with
its own copy of the file, and copying a folder copies what is in it.

- To move items, select **Cut** in their menu or in the bar at the bottom, open the folder they go
  to, and select **Paste** in its menu. Cut items stay where they are, faded, until you paste them.
- To copy items, select **Copy** instead of **Cut**. You can paste a copy more than once. Pasting into
  the folder it came from makes a copy beside the original, and so does pasting a copied folder onto
  itself: copy **Products**, paste on **Products**, and you get **Products (1)** beside it.
- To copy items without the clipboard, select them and select **Copy to** in the bar at the bottom,
  then choose the folder.
- To stop a cut, press Esc when nothing is selected.

Ctrl+X, Ctrl+C and Ctrl+V (Cmd on a Mac) do the same, and Ctrl+V pastes into the folder the window
shows. With nothing selected, Ctrl+C copies the item you last clicked. An item a folder does not
accept is left where it is, the rest go, and a notification says which did not go and why.

- To copy or cut a folder from the tree, click it and press Ctrl+C or Ctrl+X.
- To move a folder to the recycle bin from the tree, click it and press Delete. Umbraco asks first.
- To paste into a folder in the tree, click it and press Ctrl+V.

A folder you paste or drop into shows it in the tree: it loads at once, then opens, and the folders
that went into it light up for a moment.

## Pictures and files from your computer

The Media Manager shares the clipboard with your other programs.

- To use a picture somewhere else, select it and press Ctrl+C (Cmd+C on a Mac), then paste it into
  an email or a chat. Copying one image puts the picture itself on the clipboard.
- To add a screenshot, open the folder it goes in and press Ctrl+V. It is named **Pasted image**
  with the date and time, since a screenshot has no name of its own.
- To add files or folders, drag them from your computer onto a window, a folder, or a folder in the
  tree. A label says which folder they will go into. Folders keep what is in them.

Pasting a picture you copied in the Media Manager makes a copy of the item, not a second upload.
Ctrl+V pastes what you copied or cut last: what you copied in the Media Manager, until you go to
another program.
Files cannot go into the recycle bin.

## Dragging

Drag items to move them. Where they would land is outlined and tinted, a whole window, a folder or a
folder in the tree, and a label under the pointer says what letting go will do. A window does not
have to be the active one to drop into it.

- To move items, drag them onto another window, onto a folder, or onto a folder in the tree. Hold a
  drag on a closed folder in the tree to open it, when it has folders inside.
- To copy items, hold Ctrl (Option on a Mac) while you let go.
- To move items to the recycle bin, drag them onto **Recycle Bin** in the tree.
- To restore items, drag them out of the recycle bin onto a folder or a window.

Dragging a selected item drags the whole selection. When a folder does not accept some of the items,
the label says how many will go and which will not; when it accepts none, it turns red and nothing
happens. The window you drop on comes to the front with the items selected.

## Transfers

A move, copy or upload that takes more than two seconds opens the **Transfers** window, one for the
whole desktop. Each transfer shows how far it is, how much is left and how long it will take, with a
row per item. Moves and copies keep going when you close the window they started from; closing a
window while it uploads asks first, since its uploads stop with it.

- To pause a transfer, select **Pause**, and **Resume** to carry on. Uploads cannot be paused.
- To stop a transfer, select **Cancel**. What is already done stays where it went.
- To try a failed item again, select **Retry** on its row, or **Retry failed** for all of them.
- To see where a transfer went, select **Open folder**.

When everything worked, the window closes by itself and a notification says what went where. When
something failed, the window stays open with each failure and Umbraco's reason for it. Closing the
window or leaving the desktop while a transfer runs asks first.

## Undo

Press Ctrl+Z (Cmd+Z on a Mac) in any Media Manager window to undo the last thing you did, in any of
them: a move is moved back, a copy's copies go to the recycle bin, a rename is renamed back, and items
moved to the recycle bin are restored. The items show up where they were, selected. Press it again to
go one step further back. Uploads cannot be undone.

If someone has changed an item since, nothing is undone and a notification says why.

## Keys

The keys work on the item with the focus, which the arrow keys move. Opening an item leaves the keys
in the window, so you can move straight on to the next one.

| Key | What it does |
| --- | --- |
| Arrow keys, Home, End | Move the focus |
| Shift with an arrow key | Select from where you were to where you move |
| Space | Select or deselect the item |
| Enter | Open the item beside the window |
| F2 | Rename the item |
| Delete (Cmd+Backspace on a Mac) | Move the selection, or the item, to the recycle bin, after Umbraco asks |
| Ctrl+X, Ctrl+C, Ctrl+V (Cmd on a Mac) | Cut, copy, paste |
| Ctrl+Z (Cmd+Z on a Mac) | Undo the last move, copy, rename or move to the recycle bin |
| A letter | Move to the next item whose name starts with the letters you type |

To rename an item, press F2, type the new name and press Enter. The name is already selected, so
what you type replaces it.

## Views

Each window has its own view. Switching one window to the list leaves the others as they are.

- To switch a window's view, use the view button at the right of its toolbar.

## Coming back

When you come back to the desktop, your Media Manager windows reopen at the folder and in the view
they had, if the desktop reopens windows for you. See
[Reopening windows](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/user/settings/reopening-windows.md).
