---
id: opening-and-saving-media
title: Opening and saving media files
description: Depend on the media service, reach its context, and open and save media library files from your app the way Notepad and Paint do.
sidebar_position: 1
---

# Opening and saving media files

The media service opens a file from the media library for your app and saves it back. It is how
Notepad and Paint work with files, and it gives your app the same behaviour with four calls:

- **Open** shows Umbraco's media picker and reads the file that was picked.
- **Save** writes a file to the media library, as a new media item or over the one it came from.
  Before it overwrites, it checks that nobody else changed the item since your app opened it.
- **Save As** asks where a new file goes, with Umbraco's folder picker, opened on the folder chosen
  last time.
- **The overwrite question** asks, in Umbraco's own confirm dialog, whether to overwrite an item
  somebody else changed.

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
  open(): Promise<MediaOpenResult>;
  save(request: MediaSaveRequest): Promise<MediaSaveResult>;
  pickSaveFolder(): Promise<SaveFolderChoice>;
  confirmOverwrite(name: string): Promise<boolean>;
}

const MEDIA_SERVICE = new UmbContextToken<MediaService>('UmbraDesktopMediaContext');
```

In your app element, consume it:

```ts
this.consumeContext(MEDIA_SERVICE, (media) => {
  this.#media = media;
});
```

The alias, the four methods and the types below are **public API**. A method only ever gains
optional fields, so your copy of the types stays correct while it lags behind.

## 3. Open a file

```ts
type MediaOpenResult =
  | { status: 'opened'; unique: string; name: string; blob: Blob; extension: string; updateDate?: string | null }
  | { status: 'cancelled' }
  | { status: 'failed'; name?: string };
```

`open()` shows the media picker. Folders cannot be picked. The answer is one of three:

- `opened`: the file's contents as a `Blob`, the media item's key and name, the file's extension in
  lower case without the dot, and the item's update date. Keep `unique` and `updateDate` for saving
  it back.
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

## 6. When the service is not there

Keep a fallback for the context being absent: in your own tests, outside the desktop, and in a
backoffice where it failed to load. Notepad and Paint wait half a second for a context that has not
arrived yet, then report that the media library cannot be reached, and save nothing.

The context is a desktop context, so it is not visible from the plain backoffice or from inside an
iframe window. See [Desktop contexts](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-contexts.md)
in the UmbraDesktop developer guide.

## 7. The worked example

Accessories' [`media-service.ts`](../../../Umbraco.Community.UmbraDesktop.Accessories/backoffice/src/shared/media-service.ts)
is how Notepad and Paint reach the service: the copied types, the token, the short wait and the
fallback, in one controller.
