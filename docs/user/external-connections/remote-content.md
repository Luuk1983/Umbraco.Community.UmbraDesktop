---
id: remote-content
title: Remote content
description: Another instance's content and media, read-only, with Umbraco's own editors.
sidebar_position: 3
---

# Remote content

**Experimental.** See [External connections](README.md).

**Remote content** shows another instance's Content and Media sections, read-only: the tree, every
document with its properties per language, and the media library. It uses this instance's own tree,
workspace and property editors, so blocks, pickers and rich text look exactly as they do on that
site. It is in the launcher's Experimental group once a connection exists.

The API user it reads with needs the Content and Media sections on the other instance. See
[Setting up connections](setting-up-connections.md#create-the-api-user).

## Pick an instance

To choose which instance to show, use the **Instance** switcher at the top of the window. Each
instance shows in the colour given to it.

## How it works

The window holds this instance's backoffice, still signed in as you, and the reads it makes are sent
through this package to the other instance, which answers as its API user. So the other site needs
nothing installed, and the browser never sees that API user's credentials. Media comes straight from
the other site's public address.

## What to expect

- **It is read-only, always.** Save, publish, delete, create, move and every other action are hidden,
  every editor is locked, and only Content and Media appear, whatever the API user may do there. If
  anything did try to write, the desktop would refuse to send it. Buttons that a package draws inside
  its own tab, such as Workflow's or Engage's, may still show; they cannot do anything.
- **It uses the editors installed here.** A custom property editor shows properly only when the same
  package is installed on this instance too. An instance on a different Umbraco version gets a
  warning before it opens, because an editor can read another version's data differently. To open it
  regardless, select **Open anyway**.
- **It covers the window until it is ready.** While the other instance is reached and the backoffice
  loads, the window says so. If anything reaches this instance by mistake instead of the other one,
  the window says that too and offers **Try again**, rather than showing what might be this
  instance's content under the other one's name.
- **It does not update by itself.** A change saved on the other site shows the next time the viewer
  reads it: open the item again, reload the tree, or pick the instance again. Live updates would need
  a connection to the other site's event hub, which is not built. The viewer also does not listen to
  this instance's live updates, because they are about this site, not the one on screen.
- **What it cannot show.** Preview, and anything else that needs the other site's front end. Media the
  browser cannot reach directly, such as protected media or a site on a private network, does not
  show.
