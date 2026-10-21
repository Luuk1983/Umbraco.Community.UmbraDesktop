---
id: optimize-images
title: Optimize images
description: Resize, convert and remove the metadata of many media library images at once, in a window of their own.
sidebar_position: 3
---

# Optimize images

**Optimize images** shrinks, converts and cleans up many images from the media library in one go:
photos straight from a camera, 6000 pixels wide and several megabytes, with the place they were taken
in their metadata. Each run has its own window, which you can minimise while it carries on, with its
progress on its taskbar button.

## Start a run

1. In a Media Manager window, or in the Media section's window, select the images.
2. In the bar at the bottom, select **Optimize images**. A window opens with the settings.
3. Choose the settings, and select the green button. It says what it does, such as **Optimize 9
   images**.

You can pass the selection as it is. Folders, files that are not images, SVGs and items in the
recycle bin are skipped, and the window says how many. **Optimize images** is on the desktop only,
for everyone who may use the Media section.

## The settings

- **Resize** fits each image inside **Max width** and **Max height**, keeping its shape. An image is
  never made larger: one already inside the box keeps its size. Leave a field empty for no limit on
  that side. The focal point and crops are kept.
- **Convert** writes each image as **JPEG**, **PNG** or **WebP**, at the **Quality** you choose. **Keep**
  writes each file's own format. PNG keeps every pixel, so it has no quality. WebP is the smallest for
  photos; PNG can be larger than the JPEG it came from, and is still saved, since you asked for it.
- **Remove metadata** removes the location, camera and date stored in the file. With **Resize** or
  **Convert** on, it is always on, because the image is saved anew and that drops them anyway. On its
  own, it removes them without saving the picture anew, so the quality stays exactly the same and a
  phone photo stays upright.
- **Save** either replaces the originals or saves copies next to them. A copy is named like the
  original with "(optimized)", in the same folder, and has all of the original's properties, such as
  its alt text and focal point.

The first run starts on resize to 2560 × 2560, WebP at 80, metadata removed, replacing the originals.
After that, the window starts on your own last settings.

When you replace images that pages use, the window warns you first, such as "4 of these images are used
in 11 places". Those pages keep working, because they point at the media item, not the file. Each
replaced image gets a new file name, though, so a link to the old file's address, pasted somewhere
outside Umbraco, no longer works.

## While it runs

Each image shows what it was and what it is now, such as "6000 × 4000 JPEG, 8.4 MB → 2560 × 1707
WebP, 412 KB", and how much it saved. The total saved is at the top. An image that is already small
enough, in the right format, is left alone and shown as **Unchanged**.

One image failing never stops the rest. A failed image says why, in Umbraco's words: a folder that
does not allow the format, for example, or somebody else saving the image after the run started. Their
change is then kept.

- To carry on elsewhere, minimise the window. The run goes on, with its progress on the taskbar
  button.
- To stop, select **Cancel**. The image being saved finishes first. What is done stays done.
- To close the window while it runs, close it as any window. The desktop asks first, and closing it
  stops the run as **Cancel** does.

## When it ends

The window says what came of it, such as "7 optimized, 1 unchanged, 1 failed". If anything failed, the
taskbar button stays in the failure colour until you look at the window.

- To try the failed images again, select **Retry failed**.
- To finish a run you cancelled, select **Run the rest**.
- Animated GIF, PNG and WebP images are skipped, because only their first frame would be kept. To
  optimize them anyway, select **Optimize animated images too**. The window asks first, since the
  animation is lost.
- To close the window, select **Close**.

Several runs can go at once, each in its own window, named after the folder its images are in.
