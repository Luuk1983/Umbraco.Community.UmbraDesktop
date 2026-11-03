---
id: media-health
title: Media Cleanup
description: Check the whole media library for unused items, orphaned files on disk and oversized images, see storage by folder, look through them, keep what is wanted, and clean up the rest in one go or one at a time, with Undo.
sidebar_position: 5
---

# Media Cleanup

**Media Cleanup** checks the whole media library and shows what can go: items no page uses, files on
disk that no item owns, and images far bigger than any page needs. One **Clean up** deals with all
three, and asks first. To decide for yourself, see which folders hold the space, look through each
list and act on part of it, or go through it one at a time beside the list. To mark something as
wanted, for everyone, keep it. It is in the launcher's **Media** group, after **Image Editor**, for
everyone who may use the Media section.

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
- **Three cards**, each in the bar's colour, with its size, a count, a few thumbnails and **See all**.
  In a narrow window they are three rows, with an arrow instead of the thumbnails:
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
- Under a card's count, how many someone keeps out of that list, such as **12 kept**. See
  [Keep what is wanted](#keep-what-is-wanted).
- **Storage by folder**, a section of its own under **Clean up**: the largest top-level folders,
  each bar coloured the same way, so a folder that is mostly unused stands out. In a very wide window
  it sits beside the cards.

The result is kept in the site's database until the next check, so it survives a restart and is the
same on every server. A Clean up updates it, so the next person sees what is left. Other changes in
the Media section show only after **Check again**.

A check more than a day old gets a warning at the top of the window, and **Clean up** stays greyed
until you select **Check again**: pages may have changed since. **Clean up** also stops if a newer
check came in while the window was open, and says so, so you look it over first.

## See storage by folder

To find which folders hold what can go, open **Storage by folder**. It is a tree, like the Media
Manager's: a folder is anything that holds items, so an item with items under it counts too.

1. On the overview, under **Storage by folder**, select a folder to open the tree with that folder
   shown, or select **Browse all folders** for the top.
2. To see what is inside a folder, select its row or its arrow. Only a folder with folders under it has
   an arrow. Select it again to close it.

The first row is the whole library. Each row has a bar, its size, and a button for each kind of thing
in it that can go, such as **214 unused** or **31 oversized**; a row with nothing to clean up has none.
Under an open folder, a line counts the items directly in it, not in a folder under it.

- To see what can go, select one of a row's buttons. The list opens on that kind, for that folder and
  everything under it; on the library's row, for the whole library. A button on the line of items
  directly in a folder opens just those.
- To open a folder in the library, select the **Open in Media Manager** icon at the end of its row.
  The library's row opens the library.
- To return to the overview, select **Back**.

Orphaned files belong to no folder, so the tree leaves them out; they are on the overview.

## Look through a list

Clean up deals with whole kinds. To see what is in one, or to act on part of it, open the list.

1. On the overview, select a kind's **See all** or its thumbnails, or select a button in **Storage by
   folder**.
2. Choose a tab: **Unused items**, **Orphaned files**, **Oversized images** or **Kept**. Each tab
   counts what it has in the folder you opened.
3. Optional: to narrow the list, type a name in the search field, or choose **Largest first**,
   **Smallest first** or **By name**.

The list is a table: a small picture, the whole name, the folder, the size and when it last changed.
It is grouped by folder, the largest group first, and each group's row says how many it has and their
size. The list shows 100 rows a page; to see the rest, use the page buttons under the table, as in the
Media section. A folder that goes on over a page starts the next page with its row again. Orphaned files
belong to no folder, so they are one group, **Files on disk**. A folder you opened includes the
folders under it; **All folders** beside its name shows every folder again. In a narrow window the
folder and the date are left out. To return to where you came from, select **Back**.

## Act on part of a list

1. Select what to act on:
   - Tick a row's checkbox, a group's checkbox for the whole group, or the checkbox in the header for
     everything on the page.
   - To select many rows at once, press anywhere in the table but a checkbox, and drag a box over
     them. Every row the box touches is selected. Near the top or bottom edge the list scrolls along.
   - To tick a run of rows, press on a checkbox and drag down the checkbox column. Started on a ticked
     row, the drag unticks instead.
2. In the bar at the foot, which says how many are selected out of how many, and their size, select
   the tab's action:
   - **Move to recycle bin** for unused items.
   - **Delete** for orphaned files. A sheet asks first, in the same words as Clean up, since the
     files are deleted for good. Only an administrator can; for anyone else **Delete** is greyed and
     says why.
   - **Optimize** for oversized images, which opens them in [Optimize images](optimize-images.md).

What went leaves the list at once. To unselect everything, select **Clear selection**, or select
the empty space under the rows. Selecting a row never clears what you ticked.

## Go through it one at a time

Select a row anywhere but its checkbox. The row is marked, and **Details** opens beside the window, as
the desktop opens a preview: a pane inside the window when there is room, or a window of its own
grouped with it when there is not. You can pop it out, dock it and close it as any other pane.
Selecting a row never ticks it.

The pane is laid out as the Media section's **Info** view. It shows the picture large, loaded at the
size it is drawn, even for a very large original, with its name and why it is listed under it. The
action and **Previous** and **Next** stay at the foot of the pane, however short it is. A PDF
shows in the browser's own viewer; another file shows an icon. Under **General** are the facts that
decide: its folder (for an orphaned file, where it is on disk), its size in pixels, its size and when it
last changed.

- To go through the list, select **Next** or **Previous** in the pane. The list turns the page when
  the next row is on the next page.
- To act on it, select the tab's action in the pane. After **Move to recycle bin** or **Optimize** the
  next row shows at once, so you can go through a list one by one. After **Delete**, which asks first,
  it moves on once the file has gone.
- To find an item in the library, select the **Show in Media Manager** icon on the picture's corner. A Media Manager window opens at
  the item's folder with the item selected. In a folder with more items than the Media Manager shows
  at once, the item may be further down, unselected.

When the last row has gone, the pane says **Nothing left in this list.** Leaving the list closes the pane.

## Keep what is wanted

Some things only look unused: a PDF linked straight from a newsletter, a hi-res download meant to be
big. Keep marks them as wanted, for everyone on the site, so they leave the lists and are never in
Clean up or in what it can free.

1. Select the rows, or open one in **Details**.
2. Select **Keep…**, beside the action in the bar at the foot of the list, or in the pane.
3. Optional: under **Why keep it?**, say why. Whoever looks next sees it.
4. Choose **For how long**: **3 months**, **A year** or **Always**. A year is chosen to begin with.
5. Select **Keep**.

What you keep leaves every list at once, whichever list you kept it from. Anyone who may use the
Media section can keep, files on disk included.

A keep ends by itself:

- When its time is up, the thing comes back to its list.
- When its file changes, since what was kept is no longer what is there: for an item, a new file; for
  a file on disk, the file written again. This shows after the next check.

A thing whose keep ended is back in its list with a **Kept until** tag on its row; hover over the tag
for the old note. Its **Details** show the old keep, and **Keep…** keeps it again.

An item a page starts using is simply no longer unused. A thing that is gone from the library at the
next check loses its keep.

## See what is kept

To see every keep, open a list and choose the **Kept** tab. Each row shows when its keep ends, or
**Always**. Select a row to see its note, who kept it and when, and until when, in **Details**.

To overrule a keep, stop keeping it: the thing comes back to its list at once.

- For one, select **Stop keeping** in **Details**.
- For many, tick them under **Kept** and select **Stop keeping** in the bar at the foot.

## Clean up

Every kind is ticked to begin with. Clean up deals with the ticked kinds only, never with anything
kept, and each says what happens to it:

- **Unused items** go to the recycle bin, so they can come back.
- **Orphaned files** are deleted for good. Each file is checked again at the moment of deleting, and a
  file an item has claimed since the check, or that someone kept since your window opened, is left
  alone. A folder left empty is removed too. The deletion is written to Umbraco's audit log under
  your name.
- **Oversized images** open in [Optimize images](optimize-images.md), where you choose the size and
  format before anything changes.

To clean up:

1. Optional: to leave a kind out, clear its checkbox. The **Clean up** button shows what the ticked
   kinds free.
2. Select **Clean up**. A sheet lists each ticked kind with its count and size, leaving out anything
   a colleague kept since your window opened.
3. Select **Clean up** in the sheet. The ring counts the items and files as they go, and the taskbar
   button shows the same.

Only an administrator can delete files. For anyone else **Orphaned files** is unticked and greyed,
and says why, and the sheet says the files stay on disk.

The figure on **Clean up** is the unused items and orphaned files in full, and about three quarters
of the oversized images' size, which is what resizing to 2560 pixels and saving as WebP usually saves.
It says "about" when **Oversized images** is ticked.

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
