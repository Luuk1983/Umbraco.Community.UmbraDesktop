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

To optimize one image, open it and select **Optimize** under the arrow beside **Edit image**: see
[What you can do with a file](media-item.md#optimize-an-image).

You can pass the selection as it is. Folders, files that are not images, SVGs and items in the
recycle bin are skipped, and the window says how many. **Optimize images** is on the desktop only,
for everyone who may use the Media section.

## The settings

The window starts with where the images come from, such as Media / Products, how many there are, and
their thumbnails. Then come two parts: what to do to the images, and where the result goes. Select
the info button beside a setting to read what it does.

**What to do.** Turn on the changes you want. A change shows its settings while it is on.

- **Resize to a maximum width or height** fits each image inside **Max width** and **Max height**,
  keeping its shape. An image is never made larger: one already inside the box keeps its size. Leave
  a field empty for no limit on that side. The focal point and crops are kept.
- **Convert to another format or quality** writes each image as **JPEG**, **PNG** or **WebP**, at the
  **Quality** you choose. **Keep** writes each file's own format, and still applies the quality to JPEG
  and WebP files; a file is only replaced when that makes it smaller. PNG keeps every pixel, so it has
  no quality.
- **Remove location, camera and date** removes that metadata from the file. While resizing or
  converting, it is always on, because the image is saved anew and that drops it anyway. On its own,
  it removes it without saving the picture anew, so the quality stays exactly the same and a phone
  photo stays upright.

When the settings will make the images larger, the window says so before you start, such as "8
images will get much larger" when you convert JPEG photos to PNG. You can still go ahead.

**Where the result goes.**

- **Replace the originals** keeps the same media items, with a new file in each.
- **Save copies next to them** makes a copy of each image in the same folder, named like the original
  with "(optimized)". A copy has all of the original's properties, such as its alt text and focal
  point.

The first run starts on resize to 2560 × 2560, WebP at 80, metadata removed, replacing the originals.
After that, the window starts on your own last settings.

When you replace images that pages use, the window says so first, such as "4 of these images are used
in 11 places". To see the places, select **Show where**. Those pages keep working, because they point
at the media item, not the file. Each replaced image gets a new file name, though, so a link to the
old file's address, pasted somewhere outside Umbraco, no longer works.

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

The progress bar goes, and the window says what came of it, such as "7 optimized, 1 unchanged, 1
failed", with a tick when the images got smaller and a warning sign when they grew or something
failed. If anything failed, the taskbar button stays in the failure colour until you look at the
window.

- To try the failed images again, select **Retry failed**.
- To finish a run you cancelled, select **Run the rest**.
- Animated GIF, PNG and WebP images are skipped, because only their first frame would be kept. To
  optimize them anyway, select **Optimize animated images too**. The window asks first, since the
  animation is lost.
- To close the window, select **Close**.

Several runs can go at once, each in its own window, named after the folder its images are in.
