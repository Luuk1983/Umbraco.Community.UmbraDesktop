/**
 * Copies the package icon into the build, for the Add-ons app's offline covers (Add-ons design §7).
 *
 * Offline, the Add-ons app shows our add-ons from a list built into the desktop, and their covers
 * cannot load the icon from the Marketplace either. Every one of our packages packs the same icon,
 * this project's `Package-image_128_128.png`, so the app serves that one from the site.
 *
 * Copied rather than committed a second time, so there is one icon file to change. Into Vite's
 * `public/` and not `wwwroot`, for the reason `build-appicons.mjs` gives: Vite empties its output
 * folder before writing, and `public/` is copied in after. Served at
 * `/App_Plugins/Umbraco.Community.UmbraDesktop/add-ons/package-icon.png`.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The icon every one of our packages packs as its NuGet icon. */
const source = join(here, '..', '..', 'Package-image_128_128.png');

/** Where the build serves it from. Gitignored: it is rebuilt every time. */
const target = join(here, '..', 'public', 'add-ons');

await mkdir(target, { recursive: true });
await copyFile(source, join(target, 'package-icon.png'));
console.log('add-ons: package-icon.png');
