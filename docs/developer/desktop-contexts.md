---
id: desktop-contexts
title: Desktop contexts
description: Run a package service on the desktop only, and open another app from yours.
sidebar_position: 6
---

# Running a service on the desktop

Some packages need code that runs while the desktop is open and never anywhere else. The Arcade is
one: it keeps score for games and checks, when the desktop opens, whether somebody beat you. A
`umbraDesktopContext` manifest is how a package asks for that.

## 1. Why not a `globalContext`

Umbraco creates a `globalContext` at the root of the backoffice. That is the plain backoffice, and
also every window on the desktop, since each window is a backoffice of its own. A service registered
as a `globalContext` would start in all of them. A `umbraDesktopContext` is created by the desktop
element and nowhere else.

## 2. The manifest

```ts
{
  type: 'umbraDesktopContext',
  alias: 'My.Package.Context',
  name: 'My package context',
  api: () => import('./my.context.js'),
}
```

The manifest has the same shape as Umbraco's other api extensions: `api` is a class or a loader that
resolves to a module exporting `api`. `conditions` are honoured. Like the other desktop manifest types,
its type name is **public API** and only ever gains optional fields.

The api is a class extending `UmbContextBase`. Its constructor receives the desktop element as host:

```ts
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

export const MY_CONTEXT = new UmbContextToken<MyContext>('My.Package.Context');

export class MyContext extends UmbContextBase {
  constructor(host: UmbControllerHost) {
    super(host, MY_CONTEXT);
  }

  override destroy(): void {
    // Release anything you started. This can run twice, so make it safe to repeat.
    super.destroy();
  }
}

export { MyContext as api };
```

As with the types in [Building a desktop app](desktop-apps.md), nothing is imported from the host. If
your package has no `@umbraco-cms/backoffice` types for the manifest, declare the small shape you
use.

## 3. When it lives

The desktop creates your context when it connects and destroys it when it disconnects, so there is
one per visit to the desktop. Work that should happen once per visit belongs in the constructor.
Leaving the desktop leaves nothing of your package running.

Two things to know about failure and teardown:

- **A context that fails to load does not stop the others.** Umbraco's initializer does not catch a
  loader that rejects, so the failure shows in the browser console as an unhandled promise rejection.
  Your context never appears, and every other package's context still loads.
- **Make `destroy()` safe to run twice.** Umbraco calls it twice on its classes. Guard anything that
  would break the second time, such as clearing a timer that is already cleared.

## 4. Reaching it from an app

Your apps run inside the desktop, so `consumeContext` finds your context from them:

```ts
this.consumeContext(MY_CONTEXT, (context) => {
  this.#context = context;
});
```

Other packages find it the same way, with a token built from the same alias string:
`new UmbContextToken<TheShapeTheyUse>('My.Package.Context')`. Nothing is imported between packages.
Keep a fallback for the context being absent, as in [Formatting dates and times like the
desktop](desktop-apps.md#72-formatting-dates-and-times-like-the-desktop): it is missing in your own
tests, and in a backoffice where the desktop is not open.

A context created here is not visible from the plain backoffice or from the content of an iframe
window. An app that is an element on the desktop is inside it; a backoffice window is not.

The Arcade's context is the worked example: a game consumes it by the alias string and declares the
small shape it uses. See [Putting your game on the
Arcade](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/src/Umbraco.Community.UmbraDesktop.Services.Arcade/docs/developer/putting-your-game-on-the-arcade.md).

### Services you can use

Two service packages provide a context like this for other packages to use. Depend on the package,
and reach its context by its alias:

| Package | Context alias | What it does |
| --- | --- | --- |
| `Umbraco.Community.UmbraDesktop.Services.Arcade` | `'UmbraDesktopArcadeContext'` | High scores and leaderboards for games. See [Putting your game on the Arcade](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/src/Umbraco.Community.UmbraDesktop.Services.Arcade/docs/developer/putting-your-game-on-the-arcade.md) |
| `Umbraco.Community.UmbraDesktop.Services.Media` | `'UmbraDesktopMediaContext'` | Opening a media library file in your app and saving it back, with a check for somebody else's changes. See [Opening and saving media files](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/src/Umbraco.Community.UmbraDesktop.Services.Media/docs/developer/opening-and-saving-media.md) |

## 5. Opening another app

The window manager is published for two calls. **This is public API**: the alias, the members and
their behaviour are kept stable.

| | |
|---|---|
| Context alias | `'UmbraDesktopWindowManagerContext'` |
| `openApp(alias, options?)` | Opens the app with that manifest alias, as the launcher would, and returns `true`. Returns `false` when the current user cannot launch it, or no such app exists. `options.location` opens it at a location, handed to its element as `location` (see [Remembering where your app is](desktop-apps.md#73-remembering-where-your-app-is)); the Media Manager's "Open in new window" opens a folder this way. With `options.reuse: true`, a window of that app already at that location comes to the front instead, and a new one opens only when there is none; the Media add-on's **Edit image** opens the Image Editor this way, so an image already being edited is not opened twice. A window is found by the location its app last reported, so one that has moved on is not found. An older desktop ignores `options` |
| `entityChanged(entityType, unique)` | Tells every window showing that entity that your package just changed it, for `media` and `document`. A clean window or item pane reloads in place, a window with unsaved changes gets the **Someone else changed this while you were editing it** banner, and an app showing it (see [When somebody else changes what your app shows](desktop-apps.md#78-when-somebody-else-changes-what-your-app-shows)) is asked by version. Call it after you save. The server's own event would do the same, but its connection can be down or late, and a window beside your save then shows the old version. The media service package calls it after every save over an item. Missing on a desktop older than 17.5, so call it as `windows.entityChanged?.(...)` |

Declare the shape you use and a token with the same alias, and consume it:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

interface DesktopWindows extends UmbContextMinimal {
  openApp(alias: string): boolean;
}

const DESKTOP_WINDOWS = new UmbContextToken<DesktopWindows>('UmbraDesktopWindowManagerContext');

this.consumeContext(DESKTOP_WINDOWS, (windows) => windows?.openApp('Other.Package.Game'));
```

An app already open is focused rather than opened a second time when its manifest forbids more than
one. An app hidden from the user by a condition cannot be opened this way either.

### From inside a backoffice window

Code that runs inside a backoffice window, such as an entity action in the Media section, runs in the
window's frame, where `consumeContext` cannot see the desktop's contexts (see [Reaching it from an
app](#4-reaching-it-from-an-app)). It can still reach the window manager. The frame's `<iframe>`
element sits inside the desktop, so a context request dispatched on it rises to the desktop, which
answers it at once:

```ts
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

interface DesktopWindows extends UmbContextMinimal {
  openApp(alias: string, options?: { location?: string; reuse?: boolean }): boolean;
}

/** The desktop's window manager, from a frame on the desktop; undefined anywhere else. */
function findDesktopWindows(): DesktopWindows | undefined {
  let frame: Element | null = null;
  try {
    frame = window.frameElement;
  } catch {
    return undefined;
  }
  if (!frame) return undefined;
  let found: DesktopWindows | undefined;
  const event = Object.assign(new Event('umb:context-request', { bubbles: true, composed: true, cancelable: true }), {
    contextAlias: 'UmbraDesktopWindowManagerContext',
    apiAlias: 'default',
    stopAtContextMatch: true,
    callback: (instance: unknown) => {
      found = instance as DesktopWindows;
      return true;
    },
  });
  frame.dispatchEvent(event);
  return found;
}
```

The answer is synchronous, so ask when you need it, at the click, rather than holding on to it.
`undefined` means the code is not running in a window on the desktop: in the plain backoffice, or in a
frame of some other page. Code that can run in either place, as an entity action can, asks twice,
both times at once: first with a context request from its own element, which finds the desktop when the
code is on the desktop page, then from the frame as above. Do not wait with `consumeContext` for the
first: it never answers when there is no desktop, so it would wait forever in the plain backoffice.
The Media add-on's **Edit image** action asks both ways, and hides itself with a condition built on the
same two questions when neither finds a desktop.
