---
id: optimizing-images
title: Optimizing images
description: Resize, convert and strip the metadata of an image file, or of media library images in an Optimize images window, from your own add-on.
sidebar_position: 2
---

# Optimizing images

The media service optimizes images the way the Media add-on's **Optimize images** action does, and
your add-on can use the same work:

- **A file in, a file out.** `optimizeFile` resizes, converts or strips the metadata of an image file
  you hold, such as one a person is about to upload. Nothing is saved and nothing shows.
- **Media items in, a report out.** `optimizeMedia` opens an Optimize images window for media items
  you name, with its settings, its progress on the taskbar and its report, and tells you how the run
  went when it ends.

Everything runs in the browser, one image at a time, with the decoding and encoding in a web worker
so the desktop stays smooth while it works. Where a site's content security policy refuses a worker,
the page does the work instead. Each saved image goes through the service's own save, so
permissions, the media types a folder allows and the check for somebody else's changes apply per
image.

## 1. Reach the context

Depend on the package and reach its context by its alias, as
[Opening and saving media files](opening-and-saving-media.md#2-reach-the-context) shows. Add the two
methods to your copy of the context's shape:

```ts
interface MediaService extends UmbContextMinimal {
  optimizeFile(file: File, options?: OptimizeOptions): Promise<OptimizeFileResult>;
  optimizeMedia(request: OptimizeMediaRequest): Promise<OptimizeReport>;
}
```

The context is on the desktop page. Code inside a backoffice window, such as an entity action in the
Media section, reaches it through the window's frame, the way
[Opening another app](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-contexts.md#from-inside-a-backoffice-window)
reaches the window manager, with `'UmbraDesktopMediaContext'` as the alias.

## 2. The options

```ts
interface OptimizeOptions {
  resize?: { maxWidth?: number; maxHeight?: number } | null;
  format?: 'keep' | 'jpeg' | 'png' | 'webp';
  quality?: number;
  removeMetadata?: boolean;
  animated?: 'skip' | 'first-frame';
}
```

| Field | Meaning |
| --- | --- |
| `resize` | Fit the image inside this box, keeping its shape. Never makes it larger. Leave out a side for no limit on it. Absent or `null` for no resize |
| `format` | The format to write. `keep`, the default, writes the file's own format; a GIF or BMP that has to be written again is written as PNG |
| `quality` | 1 to 100, for JPEG and WebP. 80 when absent. Given, it applies even when the format stays the file's own: a JPEG or WebP is encoded again at it and kept only if it came out smaller, so a higher quality never makes a file larger |
| `removeMetadata` | Remove location, camera and date. Always done with a resize or a convert, since those write the picture anew. On its own it removes the metadata from the file's bytes and leaves the picture exactly as it was, keeping the colour profile and the orientation, so a phone photo stays upright |
| `animated` | An animated GIF, PNG or WebP is skipped unless this is `first-frame`, which keeps only its first frame and loses the animation |

Every field is optional, and absent means "leave that alone".

## 3. A file in, a file out

```ts
interface ImageFacts { width: number; height: number; size: number; format: string }

type OptimizeFileResult =
  | { status: 'optimized'; file: File; before: ImageFacts; after: ImageFacts }
  | { status: 'unchanged'; reason: 'fits' | 'no-metadata' | 'nothing-asked' | 'not-smaller'; before: ImageFacts }
  | { status: 'skipped'; reason: 'not-an-image' | 'vector' | 'animated' }
  | { status: 'failed'; message: string };
```

```ts
const result = await media.optimizeFile(file, { resize: { maxWidth: 2560, maxHeight: 2560 }, format: 'webp' });
if (result.status === 'optimized') upload(result.file);
```

- `optimized`: `file` is the new file, named like the old one with the new format's extension.
  `before` and `after` are the image's upright size, its file size in bytes and its format.
- `unchanged`: nothing would change, so nothing was done. `fits` means the image is already inside
  the box, in the format asked, with no metadata to remove; `no-metadata` means only metadata was
  asked for and it has none; `nothing-asked` means every option was off; `not-smaller` means it was
  encoded again at the quality asked, in its own format, and came out no smaller, so it was kept.
- `skipped`: the file is not a raster image this can write, is a vector image, or is animated.
- `failed`: the browser could not decode or encode it, such as WebP in Safari, which cannot write it.
  `message` says why.

## 4. Media items in, a report out

```ts
interface OptimizeMediaRequest {
  items: string[];
  options?: OptimizeOptions;
  save?: 'replace' | 'copy';
  start?: boolean;
  title?: string;
  onProgress?: (progress: { completed: number; total: number; location: string }) => void;
}
```

| Field | Meaning |
| --- | --- |
| `items` | Media keys, in the order to process them. Pass a selection as it is: folders, files that are not images and items in the recycle bin are skipped and counted, not failed |
| `options` | What the settings start on. Without it, the person's own settings from their last run, or the defaults: resize to 2560 × 2560, WebP at 80, metadata removed |
| `save` | `replace`, the default, writes over each item, keeping its key, media type, focal point and crops. `copy` saves a full copy next to each, named "*name* (optimized)", with every property of the original |
| `start` | `true` skips the settings and runs at once |
| `title` | Plain text for the window's title, in place of the folder's name |
| `onProgress` | Called whenever the run gets further, with how many images it has finished with of how many, the same figures the window shows on the taskbar. Files that are not images count in neither. `location` is the run's window, for `openApp(alias, { location, reuse: true })` to bring it forward |

```ts
const report = await media.optimizeMedia({ items: selection, options: { format: 'webp' } });
if (report.status === 'finished') showSaved(report.saved);
```

The call opens an Optimize images window for the run and resolves when the run ends:

```ts
interface OptimizeReport {
  status: 'finished' | 'cancelled' | 'not-started';
  items: OptimizeItemReport[];
  saved: number;
}

interface OptimizeItemReport {
  unique: string;
  name: string;
  status: 'optimized' | 'unchanged' | 'skipped' | 'failed' | 'not-started';
  before?: ImageFacts;
  after?: ImageFacts;
  copy?: string;
  reason?: string;
}
```

- `finished`: every image was processed. One failing never stops the rest.
- `cancelled`: the person cancelled, or closed the window while it ran. The image being saved
  finishes first; the rest are `not-started`.
- `not-started`: the person cancelled on the settings, or there is no desktop to open the window on.

`saved` is the bytes saved over the optimized images, negative when they grew, as a photo converted to
PNG can. `copy` is the new item's key when saving copies. `reason` says, in the person's language, why
an item was unchanged, skipped or failed.

A replaced image's file gets a new name, so every cache shows the new picture. Pages and pickers
store the item's key and keep working; a link to the old file's address does not.

After the report, the person can still press **Retry failed** or **Run the rest** in the same window.
Those runs are theirs, and are not reported to you.

## 5. What is not offered

Steps of your own, such as a watermark, cannot be added to a run. The run is built as a list of steps
inside, so this can be opened later without changing what is published here.
