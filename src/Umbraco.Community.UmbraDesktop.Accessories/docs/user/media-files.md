---
id: media-files
title: Opening and saving files
description: How Notepad and Paint open files from the media library and save them back.
sidebar_position: 4
---

# Opening and saving files

Every file Notepad and Paint open or save lives in the media library. Nothing is saved to your own
computer.

## Open a file

1. Select **Open…**. Umbraco's own media picker opens, with its folders, search and **Upload** button.
2. Optional: to edit a file from your computer, select **Upload** and upload it first.
3. Choose the file. It opens in the window, and its media item's name appears in the status bar.

## Save

The first time a new document or picture is saved, the window asks where, as Save As always did:

1. Select **Save**. Umbraco's folder picker opens with the root of the media library chosen.
2. Select a folder, or leave the root chosen, and select **Choose**. The file is saved there.

After that, **Save** writes back over the same media item without asking. Cancelling the picker saves
nothing. The file takes the name in the status bar, so changing the name and saving renames the item.

Saving works the way dragging a file into the Media section does: the file's extension decides the
media type, the folder has to allow that type, and you need access to the Media section and to that
folder. If any of that says no, the reason appears in the window's status bar and your work stays
unsaved.

## When someone else changed the file

If someone changed the media item after you opened it, **Save** asks before overwriting their
version. Select **Overwrite** to save yours over it, or cancel to save nothing and keep your work
unsaved in the window.

## Unsaved work

Unsaved work is protected the way an unsaved page is: the window shows the unsaved dot, and closing
it, or leaving the desktop, asks first. **New** and **Open…** ask too.
