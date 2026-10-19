---
id: opening-and-saving-media
title: Opening and saving media files
description: Depend on the media service, reach its context, and open and save media library files from your app the way Notepad, Paint and the Image Editor do.
sidebar_position: 1
---

# Opening and saving media files

The media service opens a file from the media library for your app and saves it back. It is how
Notepad, Paint and the Image Editor work with files, and it gives your app the same behaviour with a
few calls:

- **Open** shows Umbraco's media picker and reads the file that was picked, or opens an item you
  name by its key.
- **Save** writes a file to the media library, as a new media item or over the one it came from.
  Before it overwrites, it checks that nobody else changed the item since your app opened it.
- **Save As** asks where a new file goes, with Umbraco's folder picker, opened on the folder chosen
  last time.
- **The overwrite question** asks, in Umbraco's own confirm dialog, whether to overwrite an item
  somebody else changed.
- **Recent files** lists the files this person opened or saved lately, through any app.
- **The file menu** is a ready-made element with Open, Save, Save as, Info and Close, for an app
  that would rather not build those itself, and **the open view** shows Open on its own.

Everything goes through the backoffice's own pickers and media repositories, so permissions, media
start nodes and the media types a folder allows apply exactly as they do in the Media section.

## 1. Depend on the package

Your add-on must depend on the media service package, so that installing your add-on installs it:

```xml
<PackageReference Include="Umbraco.Community.UmbraDesktop.Services.Media" Version="[17.0.0, 18.0.0)" />
```

Use the same range as you use for UmbraDesktop itself. The service is released with the desktop and
shares its version number.

Your code never imports the service. It reaches it by a context token, as the next section shows.

## 2. Reach the context

The service is a desktop context, so it is there for any app that is an element on the desktop.
Declare the part you use and a token with the published alias, `'UmbraDesktopMediaContext'`:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

interface MediaService extends UmbContextMinimal {
  open(options?: { unique?: string }): Promise<MediaOpenResult>;
  save(request: MediaSaveRequest): Promise<MediaSaveResult>;
  pickSaveFolder(): Promise<SaveFolderChoice>;
  confirmOverwrite(name: string): Promise<boolean>;
  recent(accept?: readonly string[]): Promise<RecentMediaEntry[]>;
  forgetRecent(unique: string): void;
}

const MEDIA_SERVICE = new UmbContextToken<MediaService>('UmbraDesktopMediaContext');
```

In your app element, consume it:

```ts
this.consumeContext(MEDIA_SERVICE, (media) => {
  this.#media = media;
});
```

The alias, the methods and the types below are **public API**. A method only ever gains
optional fields, so your copy of the types stays correct while it lags behind.

## 3. Open a file

```ts
type MediaOpenResult =
  | {
      status: 'opened';
      unique: string;
      name: string;
      blob: Blob;
      extension: string;
      updateDate?: string | null;
      folder?: string | null;
      folderName?: string;
      focalPoint?: { left: number; top: number } | null;
      fileName?: string;
    }
  | { status: 'cancelled' }
  | { status: 'failed'; name?: string };
```

`open()` shows the media picker. Folders cannot be picked. `open({ unique })` opens that item without
the picker, which is how a list of recent files opens one. The answer is one of three:

- `opened`: the file's contents as a `Blob`, the media item's key and name, the file's extension in
  lower case without the dot, and the item's update date. Keep `unique` and `updateDate` for saving
  it back. `folder` is the key of the folder the item is in (`null` at the root) and `folderName` its
  name. `focalPoint` is an image's focal point as fractions of its width and height, or `null` when it
  has none. `fileName` is the file's own name, as its address ends: name your saved file the same, with
  a new extension only for a new format, and its address stays the same.
- `cancelled`: the picker was closed. Do nothing.
- `failed`: the file could not be read. `name` is what was picked, for your message.

The service opens any file. Whether it suits your app is yours to decide once you have it, so you can
say so in your own words. Notepad refuses a picture, and Paint refuses an SVG.

## 4. Save a file

```ts
interface MediaSaveRequest {
  file: File;
  name: string;
  folder: string | null;
  existing?: string;
  expectedUpdateDate?: string | null;
  force?: boolean;
  resetFocalPoint?: boolean;
}

type MediaSaveResult =
  | { ok: true; unique: string; updateDate?: string | null }
  | { ok: false; conflict?: true; message?: string };
```

| Field | Meaning |
| --- | --- |
| `file` | The file. Its name's extension decides the media type, as a drag and drop into the Media section does |
| `name` | The media item's name. It need not be the file's name |
| `folder` | The folder a new item goes in, or `null` for the root. Ignored when `existing` is still there |
| `existing` | The item your document came from or was last saved as. A save overwrites it instead of creating a copy. If it has been deleted or is in the recycle bin, a new item is created in `folder` |
| `expectedUpdateDate` | The update date your document last saw: from `open()`, or from your last save. Leave it out to skip the check |
| `force` | Overwrite `existing` even if somebody changed it since |
| `resetFocalPoint` | When overwriting `existing`, clear its focal point and every named crop's coordinates. Send it after a crop, rotate or flip, which moves what those fractions point at. Leave it out for anything else, and they are kept |

A save that would overwrite a version your document has not seen writes nothing and answers
`{ ok: false, conflict: true }`. Ask, and save again with `force` on a yes:

```ts
let result = await media.save(request);
if (!result.ok && result.conflict) {
  if (!(await media.confirmOverwrite(savedName))) return;
  result = await media.save({ ...request, force: true });
}
if (result.ok) {
  this.#unique = result.unique;
  this.#updateDate = result.updateDate;
}
```

Keep the `unique` and `updateDate` a successful save answers, and send them with the next save.

When the media library refuses the file, `message` says why in the backoffice's own words, such as a
folder that does not allow that media type. Show it to the person. Without a message, the save failed
for a reason the backoffice already reported in a notification.

## 5. Ask where a new file goes

```ts
type SaveFolderChoice = { status: 'chosen'; folder: string | null } | { status: 'cancelled' };
```

`pickSaveFolder()` opens Umbraco's folder picker, with the root of the media library selectable and
selected the first time. An editor with a media start node sees their own folders instead. The
picker opens on the folder chosen last, which is remembered for the backoffice session and shared by
every app that uses the service. Call it before the first save of a new document, and pass the
folder as `folder`. On `cancelled`, save nothing.

## 6. List recent files

```ts
interface RecentMediaEntry {
  unique: string;
  name: string;
  extension: string;
  folder: string | null;
  folderName?: string;
  at: number;
}
```

The service remembers the last 12 files each person opened or saved through it, by any app, in this
browser. `recent(['jpg', 'png'])` lists the ones with those extensions, newest first; `recent()`
lists all of them. Open one with `open({ unique })`.

An entry is only what the browser remembers. The item may have been deleted, moved to the recycle
bin or put out of this person's reach since, and then `open` answers `failed`. Call
`forgetRecent(unique)` to take it off the list. The file menu asks the media library about every
entry before it shows the list: it forgets the ones that are gone or in the recycle bin, and one that
fails to open. When the media library cannot be asked, it keeps them all.

## 7. Use the file menu

The file menu is a custom element the service defines, `<umbradesktop-media-file-menu>`. It slides
in from the right edge of your app over a dimmed app, the way Umbraco's own side panels do, with
Open, Save, Save as, Info and Close. Open, Save as and Info each slide their own panel in over it,
with an arrow back to the menu. You give it your document and how to encode it; it runs the opens and
saves and tells you what happened. The Image Editor in the UmbraDesktop Media Add-on is the worked
example: a "..." button beside its Save button opens it.

The service also defines `<umbradesktop-media-open-view>`: Open on its own, the recent files with
Browse and Upload under them, for your app's empty canvas, so the first thing a person sees is what
they can open.

Use them by their tag names, with these types copied into your package:

```ts
type FileMenuPanel = 'menu' | 'open' | 'saveAs' | 'info';
type SaveFormat = 'jpeg' | 'png' | 'webp';
interface FileMenuDocument {
  unique: string | null;          // null: never saved
  name: string;                   // as the person typed it, which a save renames the item to
  folder: string | null;
  folderName?: string;
  updateDate?: string | null;
  extension: string;              // the item's file extension now
  width: number; height: number;  // as it will be saved
  bytes: number;                  // the item's file size now
  fileName?: string;              // the file's own name, which a replace keeps
}
type FileEncoder = (format: SaveFormat, quality: number) => Promise<Blob>;
interface FileSavedDetail { unique: string; updateDate?: string | null; name: string; extension: string;
  folder: string | null; folderName?: string; copy: boolean; bytes: number; fileName: string }
type FileSaveOutcome = { status: 'saved'; saved: FileSavedDetail } | { status: 'needs-save-as' }
  | { status: 'cancelled' } | { status: 'failed'; message?: string };
```

1. **Render the menu** as the last child of your app's element, which must be positioned
   (`position: relative`): the menu places itself over all of it. Give your app at least
   520 × 542 pixels, the menu's smallest size. Smaller, and Save as no longer fits.

   ```ts
   html`<umbradesktop-media-file-menu
     .label=${'Image Editor'}
     .document=${this.document}
     .dirty=${this.dirty}
     .accept=${['jpg', 'jpeg', 'png', 'webp']}
     .encode=${this.encode}
     .preview=${this.previewUrl}
     .resetFocalPoint=${this.reframed}
     @umbradesktop-media-file-open=${this.onOpen}
     @umbradesktop-media-file-saved=${this.onSaved}
     @umbradesktop-media-file-failed=${this.onFailed}
     @umbradesktop-media-file-hidden=${this.onHidden}
     @umbradesktop-media-file-close=${this.onClose}></umbradesktop-media-file-menu>`;
   ```

2. **Show it** from your own "..." button with `show()`, or straight on a panel with `show('open')`
   or `show('saveAs')`, for Ctrl+O and Ctrl+Shift+S. It reflects an `open` attribute while it
   shows. It puts itself away on Escape, a click on the dimmed app and its own buttons, after a
   successful Save as, and when you call `hide()`; each time it fires `hidden`, so your app can take
   its view back.

3. **Save from your own button** with `save()`. It writes over the item in its own format. For a
   file whose format cannot be written back, such as a GIF, it shows the menu on Save as with PNG
   chosen and answers `needs-save-as`. The menu's own Save does the same and then puts itself away.

4. **Take what it tells you.** On `open`, the event's `detail` is the opened file, as `open()`
   answers it; check it suits your app, then call `hide()`. On `saved`, take the `detail` as your
   document's new facts: after a copy, your document is the copy, and the next save writes to it. On
   `failed`, show `detail.message`. On `close`, close your window, for example with the desktop's
   `umbradesktop-close-request` event.

5. **Show the open view while nothing is open**, if you want one, with `accept`, `dirty` and a
   `heading` such as "Open an image". It fires the same `open` and `failed` events as the menu.
   It reads the recent list when it is connected, so render it while your app is empty and remove it
   once a file is open.

| Property | Meaning |
| --- | --- |
| `label` | Your app's name: the menu's title, and what Close says it closes. "Menu" without one |
| `document` | What your app has open, or `null`. With `null`, Save, Save as and Info are drawn disabled |
| `dirty` | Whether your app holds unsaved work. Save is enabled only then, and opening another file asks first |
| `accept` | The extensions your app opens. The recent list shows only those |
| `encode` | Writes your document in a format and quality. Save as calls it to measure the size after, and every save calls it to make the file |
| `preview` | An image URL of the picture as it will be saved, for Save as |
| `resetFocalPoint` | Sent with a save over the item, as `resetFocalPoint` on the request |

The menu draws itself in the desktop's app tokens, so every theme draws it in its own idiom: Save
copy and the other main actions in `--umbradesktop-app-action`, which is Umbraco's green Save in the
Umbraco themes. Paint your own Save button with the same token and it matches.

## 8. When the service is not there

Keep a fallback for the context being absent: in your own tests, outside the desktop, and in a
backoffice where it failed to load. Notepad and Paint wait half a second for a context that has not
arrived yet, then report that the media library cannot be reached, and save nothing.

The context is a desktop context, so it is not visible from the plain backoffice or from inside an
iframe window. See [Desktop contexts](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-contexts.md)
in the UmbraDesktop developer guide.

## 9. The worked example

Accessories' [`media-service.ts`](../../../Umbraco.Community.UmbraDesktop.Accessories/backoffice/src/shared/media-service.ts)
is how Notepad and Paint reach the service: the copied types, the token, the short wait and the
fallback, in one controller.
