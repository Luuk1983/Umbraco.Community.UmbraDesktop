---
id: media-health
title: Media Health
description: Check the whole media library for where the space goes, unused media, orphaned files on disk and oversized images, and act on each.
sidebar_position: 5
---

# Media Health

**Media Health** answers four questions about the whole media library: where the space goes, what
is unused, what is on disk with no media item, and which images are oversized. Each has its own verb,
so the answer is something you can act on, not a report. It is in the launcher's **Media** group,
after **Image Editor**, for everyone who may use the Media section.

## Check the library

Nothing is measured until you ask. Opening the window measures nothing, and nothing runs on a timer,
so the backoffice and the site are never slowed for someone who did not ask.

1. In the launcher, select **Media Health**. The window says **No check yet**.
2. Select **Check**. The window shows what the check is doing, finding what is used, then scanning
   the media folder, then reading the result, with how far it is, and its taskbar button shows the
   same.

The check runs on the server. To carry on elsewhere, minimise the window, or close it: the check keeps
running, and the result is in the window when you open it again. Another person opening Media Health
sees the same check, and the same result when it is done.

When it ends, the window shows:

- **The library in one line**: its size, and how many items and folders it holds.
- **A bar** of the largest top-level folders by size, with the rest and the items at the top of the
  library as **Other**.
- **Three rows**, each with its count and size: **Unused media**, **Orphaned files** and **Oversized
  images**.
- **Checked today, 3:12 PM**, or the day it was checked, with **Check again**.

The result is kept in the site's database until the next check, so it survives a restart and is the
same on every server of the site. It is a snapshot: media added, trashed or re-used since the check
show in the Media section at once, but in Media Health only after **Check again**.

## Unused media

Items that no page is placed on: nothing in a page's content picks them, and nothing picks a folder
they are in. The check reads the references Umbraco keeps when a page is saved, which is what the
item's own **Info** tab shows under **Referenced by**. An item used in a way Umbraco does not track,
such as a file address typed into a text field, counts as unused, so look before you trash.

- To see them, select **View**. The list is largest first, with each item's name, its folder and its
  size.
- To open an item beside the window, in Umbraco's own editor, select its name. Its **Info** tab shows
  **Referenced by**.
- To edit an image, select **Edit image**. The [Image Editor](image-editor.md) opens with it.
- To move an item to the recycle bin, select its **Trash** button. Umbraco asks first. This is the
  same recycle bin as in the Media section, so the item can be restored there, and
  [Undo](media-manager.md#undo) in a Media Manager window puts it back as well.

**Review**, which steps through the unused items one at a time, is coming later; its button is there
but greyed until then.

## Orphaned files

Files in the media folder on the server that no media item owns, for example what was left behind
when a site was moved or an item was deleted by hand. Items in the recycle bin still own their files,
so those are never listed.

- To see them, select **View**. Each file shows its path under the media folder, when it was last
  written and its size, with **Open** to see it in a new tab.
- To delete them all, select **Delete...** on the row. To delete one, select **Delete** on its line
  in the list. The window says how many files and how much space, and asks first.

Deleting is for good: there is no recycle bin for a file without an item. Only an administrator can
delete; for anyone else the buttons are greyed and say why. Each file is checked again at the moment
of deleting, against the library as it is then: a file an item has claimed since the check, by an
upload or a restore from the recycle bin, is left alone and the window says so. A folder the delete
leaves empty is removed too. The deletion is written to Umbraco's audit log under your name.

## Oversized images

Images over 2 MB. Most of them are photos straight from a camera, far larger than any page shows
them, and shrinking them is what [Optimize images](optimize-images.md) does.

- To see them, select **View**. The list is largest first, with **Edit image** on each.
- To shrink them, select **Optimize...**. An **Optimize images** window opens with every oversized
  image, and its settings. When the run ends, the row follows the new sizes.

The saving the row names is an estimate, about three quarters of the images' size, which is what
resizing to 2560 pixels and converting to WebP usually saves. The **Optimize images** window reports
the real figure as it runs.

## What the check reads

The check reads the media library once, a page at a time, and Umbraco's tracked references once, so
a library of ten thousand items is a handful of queries. Then it walks the media folder, wherever
the site keeps it, through Umbraco's own media file system, so a site on blob storage is checked the
same way. It never changes anything: only **Trash** and **Delete** do, and each asks first.
