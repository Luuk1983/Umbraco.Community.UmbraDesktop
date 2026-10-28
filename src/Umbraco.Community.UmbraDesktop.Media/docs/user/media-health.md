---
id: media-health
title: Media Cleanup
description: Check the whole media library for unused items, orphaned files on disk and oversized images, and clean them up in one go, with Undo.
sidebar_position: 5
---

# Media Cleanup

**Media Cleanup** checks the whole media library and shows what can go: items no page uses, files on
disk that no item owns, and images far bigger than any page needs. One **Clean up** deals with all
three, and asks first. It is in the launcher's **Media** group, after **Image Editor**, for everyone
who may use the Media section.

## Check the library

Nothing is measured until you ask. Opening the window starts nothing heavy: it shows the last check,
whoever ran it, or, before the first, asks **How healthy is your media library?** and says how many
items the library has.

1. In the launcher, select **Media Cleanup**.
2. Select **Check my media library**, or **Check again** on a result. The ring fills as the items are read, and three steps tick
   off: reading the items, finding which pages use them, and scanning the files on disk. The
   window's taskbar button and title bar show the same progress.

The check runs on the server. To carry on elsewhere, minimise or close the window: the check keeps
running, and the result is there when you open it again. Only one check runs at a time. Another
person opening Media Cleanup sees the same check, and the same result. An open window looks every
30 seconds, so a check someone else starts shows up there too.

To stop a check, select **Stop** under the progress. The last result stays as it was.

## Read the overview

When the check ends, the window shows:

- **Media library** with its item count and its size, and when it was checked, with **Check again**.
- **A bar** of the whole library cut by health: what is in use on the left, and what Clean up can free
  on the right (oversized, orphaned, unused). Under it, how much is **in use** and how much **can be
  freed**.
- **Three rows**, each in the bar's colour, with a count and a size, and under the words as many
  thumbnails as fit:
  - **Unused items**: items no page uses. Nothing in a page's content picks them, and nothing picks a
    folder they are in. An item used in a way Umbraco does not track, such as a file address typed
    into a text field, counts as unused.
  - **Orphaned files**: files in the media folder that no item owns, often left behind when a site
    was moved. Items in the recycle bin still own their files, so those are never listed.
  - **Oversized images**: images over 2 MB that a page uses. An unused one is under **Unused items**
    only, since it goes to the recycle bin anyway.
- Some items have no stored size, such as the pictures Umbraco Engage installs. A row of only those
  says **Size unknown**, and a row with some of them says **at least** the size it knows, with how
  many it could not count under it. The bar leaves them out, since it cannot draw a size nobody
  knows.
- **Where the space goes**: the largest top-level folders, each bar coloured the same way, so a folder
  that is mostly unused stands out.

The result is kept in the site's database until the next check, so it survives a restart and is the
same on every server. A Clean up updates it, so the next person sees what is left. Other changes in
the Media section show only after **Check again**.

A check more than a day old gets a warning at the top of the window, and **Clean up** stays greyed
until you select **Check again**: pages may have changed since. **Clean up** also stops if a newer
check came in while the window was open, and says so, so you look it over first.

## Clean up

Every row is ticked to begin with. Clean up deals with the ticked rows only, and each row says what
happens to it:

- **Unused items** go to the recycle bin, so they can come back.
- **Orphaned files** are deleted for good. Each file is checked again at the moment of deleting, and a
  file an item has claimed since the check is left alone. A folder left empty is removed too. The
  deletion is written to Umbraco's audit log under your name.
- **Oversized images** open in [Optimize images](optimize-images.md), where you choose the size and
  format before anything changes.

To clean up:

1. Optional: to leave a row out, clear its checkbox. The **Clean up** button shows what the ticked
   rows free.
2. Select **Clean up**. A sheet lists each ticked row with its count and size.
3. Select **Clean up** in the sheet. The ring counts the items and files as they go, and the taskbar
   button shows the same.

Only an administrator can delete files. For anyone else the **Orphaned files** row is unticked and
greyed, and says why, and the sheet says the files stay on disk.

The figure on **Clean up** is the unused items and orphaned files in full, and about three quarters
of the oversized images' size, which is what resizing to 2560 pixels and saving as WebP usually saves.
It says "about" when the oversized row is ticked.

## Undo a Clean up

When Clean up is done, the window shows how much was freed and the library's size before and after.
Anything that did not go is listed with the reason, for example a file an item owns now.

- To put the items back, select **Undo** on **in the recycle bin**. Each item goes back to the folder
  it came from. Deleted files cannot come back.
- To see the oversized images being optimized, select **Show** on **Optimizing**. The card counts how
  many are done.
- To return to the overview, select **Back to the overview**.

The items are in the same recycle bin as in the Media section, so they can also be restored from
there later.

## What the check reads

The check reads the media library once, a page at a time, and Umbraco's tracked references once, so
a library of ten thousand items is a handful of queries. Then it walks the media folder, wherever the
site keeps it, through Umbraco's own media file system, so a site on blob storage is checked the same
way. The thumbnails are Umbraco's image resizer on each item's own file; nothing is generated or
stored. The check never changes anything: only Clean up does, and it asks first.
