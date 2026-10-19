![UmbraDesktop](../Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Media service

Opening and saving media library files for UmbraDesktop apps. This is a service package: you get it with an add-on that uses it, such as the UmbraDesktop Accessories Add-on or the UmbraDesktop Media Add-on, and do not need to install it yourself. Its audience is authors of desktop apps that work with media files.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Services.Media)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Services.Media) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](../../LICENSE)

## What it does

It lets a desktop app open a file from the media library with Umbraco's media picker, and save it back as a new media item or over the one it came from. Before it overwrites a file, it checks that nobody else changed it in the meantime, and asks first if somebody did. Notepad, Paint and the Image Editor use it, and an app gets the same behaviour from a few calls on one context, without importing this package. It also offers a ready-made file menu, with Open, Save, Save as, Info and Close, for apps that would rather not build one.

## For app authors

- [Opening and saving media files](docs/developer/opening-and-saving-media.md): depend on this package, reach its context, open a file, save it back, ask where a new file goes, list recent files, and use the file menu.

It has no server code and keeps nothing of its own: every file is an ordinary media item, saved through the backoffice's own media repositories with the permissions the person already has.

## License

[MIT](../../LICENSE)
