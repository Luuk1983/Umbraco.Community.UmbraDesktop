---
id: install-as-an-app
title: Install as an app
description: Install the backoffice as an app, and set its name and icon.
sidebar_position: 1
---

# Install as an app

The backoffice declares a web app manifest, so a browser can install it or pin it. The installed app
opens straight on the desktop in its own window, with no address bar and no tabs, and carries the
site's own name and icon rather than a generic browser tile. Both are settings, so an agency running
ten sites gets ten apps that can be told apart.

## Install it

1. Open the backoffice.
2. Use the browser's install action. Chrome and Edge offer it in the address bar. Firefox has it in
   its own menu.

The installed app opens on the desktop whatever [Open the desktop when I sign in](../settings/starting-in-the-desktop.md)
says. Installing the backoffice is itself a way of saying that is what you want, so the setting is
not consulted.

Leaving the desktop stays inside the app. **Exit desktop** goes to Content in the same window rather
than to a browser tab.

Installing is not a second sign-in. The app shares cookies and storage with the browser it was
installed from, so it is the same session. It is not a way to be signed in to two environments at
once.

## Set the name and icon

Both are site-wide and under **Desktop settings** > **Site**, visible only to users with access to
the Settings section. The **Preview** box at the top of the screen shows the result at roughly the
size a taskbar uses.

### Name

**App name** is the app's name.

- Left empty, the app takes the site's name, from `Umbraco:CMS:Hosting:SiteName`.
- If that is not set either, the app is called Umbraco.
- Anything typed here overrides both.

The same name is used by the [site name on the desktop](site-name-on-the-desktop.md).

### Icon

**Icon** has two choices:

- **UmbraDesktop**: the mark shipped with the package, the Umbraco logo inside the desktop's own
  loading ring, so an installed backoffice looks like the thing it opens.
- **Your own image**: any image from the Media Library. Umbraco resizes it, so one upload covers
  every size a browser asks for. The picker uploads too: drop a file into it, and the image is added
  to the library and selected in one go.

For your own image:

- **Square, and at least 512×512.** Anything smaller gets stretched, and 512 is the largest size a
  browser asks for.
- **PNG.** An `.ico` does not work. See below.
- **Simple.** The same image is shrunk to about 32 pixels on a taskbar, where small text and fine
  detail turn to mush.
- **Nothing important near the edges.** The image is cropped square, and the operating system may
  round the corners or cut it to a circle.
- Transparency is fine.

Keep the image somewhere public. An icon in a folder under public access restriction cannot be read
by the browser machinery that installs the app, so the icon silently stops working while looking
fine in the backoffice.

There is no "use my favicon" option, on purpose. Chrome does not accept an `.ico` as an app icon at
all, and a manifest that offers one stops the backoffice being installable rather than falling back,
so the option could not work on the format Umbraco ships.

## Set them from configuration instead

Both can be pinned in `appsettings.json`, which is the better option to keep them consistent across
environments. A value set here wins over the backoffice, and the matching control is shown but
disabled, with a line saying why.

```json
{
  "Umbraco": {
    "Community": {
      "UmbraDesktop": {
        "AppName": "Contoso Admin",
        "AppIcon": { "Mode": "Default" }
      }
    }
  }
}
```

`Mode` is `Default` or `Custom`. `Custom` also needs a `MediaKey`. The two pin independently, so
setting the name in configuration leaves the icon editable in the backoffice.

This matters most when databases are restored between environments. A setting made in the backoffice
lives in the database and travels with a restore, so staging recovered from production comes back
wearing production's name. A configured value does not. That goes for the
[site name on the desktop](site-name-on-the-desktop.md) too, since it is the same App name.
