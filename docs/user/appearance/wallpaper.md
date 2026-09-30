---
id: wallpaper
title: Wallpaper
description: Pick a built-in background or any image from your own Media Library.
sidebar_position: 2
---

# Wallpaper

## Change the wallpaper

1. Open [Desktop settings](../settings/desktop-settings.md) and select **Appearance**.
2. Select the **Wallpaper** row. It shows the wallpaper in use. The **Choose a wallpaper** picker
   opens.
3. Select a wallpaper. It applies straight away, and the picker stays open, so you can try a few and
   watch the desktop change behind the panel.

![Desktop settings open over the desktop, showing the theme in use above the wallpaper in use, with the wallpaper picker open beside it: every background that ships with the package, named, alongside None for the plain gradient and a tile for choosing your own image from the Media Library.](../../screenshots/choose-background.png)

The picker holds:

- **Your own image**, the first tile. See [Use your own image](#use-your-own-image).
- **None (gradient)**, which restores the plain gradient.
- The ten backgrounds that ship with the package.

The choice is stored on your Umbraco account, so it follows you between machines.

Choosing a wallpaper turns off [Match the wallpaper to the theme](themes.md#match-the-wallpaper-to-the-theme),
so a picture you picked is never replaced by the next theme.

## Use your own image

There is nothing to configure and nothing to deploy.

1. Upload the image to the Media Library, as you would any other.
2. Open **Desktop settings** > **Appearance** and select the **Wallpaper** row.
3. Select the first tile. The Media Library opens.
4. Pick the image.

Until an image has been picked, the first tile is empty. After that it is that image, so the
wallpaper in use is always the one marked. To pick another, select it again.

Umbraco resizes the image: the desktop asks for a copy with no side longer than 2560px, so a large
upload never reaches the browser at full size, and the resized copy is cached on the server. There
is no need to optimise anything first.

If the file picked is not an image, the desktop says so and leaves the current wallpaper alone.
