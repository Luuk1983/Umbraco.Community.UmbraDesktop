---
id: media-health
title: Media Cleanup
description: Check the whole media library for unused items, orphaned files on disk and oversized images, look through them, and clean them up in one go or one at a time, with Undo.
sidebar_position: 5
---

# Media Cleanup

**Media Cleanup** checks the whole media library and shows what can go: items no page uses, files on
disk that no item owns, and images far bigger than any page needs. One **Clean up** deals with all
three, and asks first. To decide for yourself, look through each list and act on part of it, or one
picture at a time. It is in the launcher's **Media** group, after **Image Editor**, for everyone who
may use the Media section.

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

## Look through a list

Clean up deals with whole rows. To see what is in a row, or to act on part of it, open the list.

1. On the overview, select a row's arrow (**See all**) or its thumbnails. To look in one folder,
   select it under **Where the space goes**, or select **All folders** for every folder.
2. Choose a tab: **Unused items**, **Orphaned files** or **Oversized images**. Each tab counts what
   it has in the folder you opened.
3. Optional: to narrow the list, type in **Search names**, or choose **Largest first**, **Smallest
   first** or **By name**.

The list is grouped by folder, the largest group first. Each group shows its first row of pictures,
and **+n more** in the last place shows the rest. Orphaned files belong to no folder, so they are one
group, **Files on disk**. A folder you opened includes the folders under it; **All folders** beside
its name shows every folder again. To return to the overview, select **Back**.

## Act on part of a list

1. Select what to act on: tick a picture's checkbox, which shows when you point at it, or tick a
   group's checkbox for the whole group.
2. In the bar at the foot, which says how many are selected and their size, select the tab's action:
   - **Move to recycle bin** for unused items.
   - **Delete** for orphaned files. A sheet asks first, in the same words as Clean up, since the
     files are deleted for good. Only an administrator can; for anyone else **Delete** is greyed and
     says why.
   - **Optimize** for oversized images, which opens them in [Optimize images](optimize-images.md).

What went leaves the list at once. To unselect everything, select **Clear selection**.

## Look at one at a time

Select a picture in the list to see it large over the list. It loads in a moment, at the size the
window shows it, even for a very large original. A PDF shows in the browser's own viewer; another
file shows an icon.

Under it are the facts that decide: its folder (for an orphaned file, where it is on disk), its size
in pixels, when it last changed, its size, and for an unused item that no page uses it.

- To go through the list, select **Next** or **Previous**.
- To act on it, select the tab's action. After **Move to recycle bin** or **Optimize** the next one
  shows at once, so you can go through a list one by one. After **Delete**, which asks first, it
  moves on once the file has gone.
- To find an item in the library, select **Show in Media Manager**. A Media Manager window opens at
  the item's folder with the item selected. In a folder with more items than the Media Manager shows
  at once, the item may be further down, unselected.
- To close it, select **Close**, or select beside the picture.

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
way. The thumbnails and the large picture are Umbraco's image resizer on each file, asked for in a
few fixed sizes so a second look comes from its cache; nothing is generated or stored. The check
never changes anything: only Clean up and the actions in a list do.
