---
id: language-and-region
title: Language and region
description: The backoffice language, how dates and times are written, and a 12 or 24 hour clock.
sidebar_position: 5
---

# Language and region

The desktop is the shell around a backoffice that is already translated, so it takes its cue from
that backoffice rather than from the browser. A Danish backoffice gets a Danish clock, whatever the
browser happens to be set to.

All three settings are in [Desktop settings](desktop-settings.md) > **Language and region**.

## Backoffice language

**Backoffice language** is your own Umbraco language, the same setting that lives in your user
profile. Changing it here changes it everywhere, not only on the desktop, and it needs no access to
the Users section. The desktop hides the backoffice header, which is where that setting normally
lives, so this is where it goes instead.

It cannot take effect where it stands: every window holds its own copy of the backoffice. So once the
change is saved, the desktop asks whether to reload.

- **Later** costs nothing. The language is already stored and applies the next time the backoffice
  opens.
- **Reload now** reloads the desktop. The dialog says how many windows are open and whether any of
  them hold unsaved changes, since those changes are lost.

## Regional format

**Regional format** decides how the desktop writes dates and times.

- **Match the backoffice language**, the default. This is what the rest of the backoffice already
  does: Umbraco formats every date it shows, in the Info tab, the audit trail and the log viewer,
  with that same language. Before this setting existed the clock alone followed the browser, so on a
  default English install the backoffice said 8:59 PM while the clock beside it said 20:59.
- **Match my browser**, for anyone who prefers the browser's format.

## Clock

**Clock** forces a 12 or 24 hour clock when the language and your habits disagree. Umbraco offers no
British English, so an English backoffice has a 12 hour clock; this is how to get 24 hour without
giving up anything else. It overrides only the hour, so Dutch still writes p.m. its own way, Danish
keeps its dot, and Japanese and Korean keep their own markers in their own places.

Left on **Automatic**, the language decides. The panel shows what the taskbar will show.

## Where they are stored

Regional format and Clock are stored on your Umbraco account, alongside the theme and wallpaper, so
they follow you to any browser you sign in on. So does the backoffice language, which Umbraco has
always kept on the user.
