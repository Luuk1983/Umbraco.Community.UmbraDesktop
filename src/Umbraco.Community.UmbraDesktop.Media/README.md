![UmbraDesktop](../Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Media Add-on

Media apps for UmbraDesktop, starting with an Image Editor: crop, adjust, mark up, redact and resize an image from the media library, and save it back or as a copy, without leaving the backoffice.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Media)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Media) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](../../LICENSE)

![The Image Editor in a window on the desktop, cropping a photo of a lounge to 16:9: the crop frame with its thirds and handles over the picture, the Crop panel with the ratios, rotate and flip, and the note that a crop resets the focal point, and the status bar with the file's name, folder, size and zoom.](docs/screenshots/image-editor.png)

- **Crop, rotate and flip**, free or to a ratio, with the image's focal point shown.
- **Adjust** exposure, brightness, contrast and saturation, and compare with the original.
- **Mark up** with text, arrows, boxes and a pen, and **redact** what should not be seen, burned into the saved file.
- **Resize**, and **save** over the image or as a copy, in JPEG, PNG or WebP, with the size before and after.

## Get started

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Media
```

That is all. UmbraDesktop comes with it if you do not have it yet, and the Image Editor appears in a Media group in the launcher for anyone who can reach the desktop. You need Umbraco 17 and .NET 10.

[Image Editor](docs/user/image-editor.md) explains how to use it.

## License

[MIT](../../LICENSE). The bundled library, Fabric.js, is MIT too; its notice is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
