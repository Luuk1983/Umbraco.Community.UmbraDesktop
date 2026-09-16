/**
 * Renders the app icon SVGs to the PNG sizes a web app manifest needs.
 *
 * Separate from `build-wallpapers.mjs` rather than folded into it: wallpapers are photographic and
 * resized for weight, these are a mark rendered at exact sizes a specification names. One script
 * doing both would have two unrelated reasons to change.
 *
 * PNG despite the source being vector. SVG is legal in a manifest and MDN flags the whole `icons`
 * member as limited availability, with SVG the patchiest part of it, so the PNGs are what actually
 * gets honoured. See `docs/design/2026-09-13-web-app-manifest-design.md` §5.
 *
 * The artwork is composed in `appicon-art.mjs` from the loader's own constants rather than drawn in
 * a file here, so the icon cannot drift away from the boot splash it is meant to be.
 *
 * To judge the output rather than assume it, run `npm run appicons:sheet` — an icon is a drawing
 * and no assertion in here can tell you it looks right.
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIconSvg } from './appicon-art.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Vite's `public/` directory, **not** `wwwroot` directly.
 *
 * This is not a style preference, it is the only thing that works. `vite.config.ts` sets
 * `emptyOutDir: true`, so vite wipes `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop` before it
 * writes — and since this script runs *before* vite in the `build` script, anything written
 * straight into that folder is deleted moments later. The failure is silent: the build succeeds,
 * the icons are simply gone, and the manifest ends up pointing at four 404s.
 *
 * Everything in `public/` is copied into the output instead, which is how the wallpapers survive
 * the same build. The served path is unchanged either way, because `public/` lands at the output
 * root: `/App_Plugins/Umbraco.Community.UmbraDesktop/appicons/…`.
 */
const target = join(here, '..', 'public', 'appicons');

/**
 * What to render.
 *
 * The 192 and the 512 are shipped because every platform's own guidance asks for them and the
 * renders are free — **not** because Chromium demands both. That belief comes from MDN and is
 * stricter than the real criterion: measured against Chrome 153, a lone 512 installs. What does not
 * install is an icon entry with no `sizes` at all, which fails silently with no error anywhere.
 *
 * **The maskable render is a different drawing, not this one re-exported.** The ordinary icon runs
 * nearly to the edge of its box, because a taskbar draws it at the size of that box and artwork that
 * stops short is just a smaller icon than everything beside it. The maskable one stops on the safe
 * boundary instead, because it is the render a launcher may crop.
 */
const RENDERS = [
  { to: 'icon-192.png', size: 192 },
  { to: 'icon-512.png', size: 512 },
  { maskable: true, to: 'icon-512-maskable.png', size: 512 },
  // Safari's own path, via <link rel="apple-touch-icon">. The one render that must not be
  // transparent: iOS does not composite it, it renders it black. Flattened onto white rather than
  // onto the theme blue, because the mark is blue — on blue it would vanish.
  { to: 'apple-touch-icon.png', size: 180, flatten: '#ffffff' },
];

await mkdir(target, { recursive: true });

for (const { maskable, to, size, flatten } of RENDERS) {
  let pipeline = sharp(Buffer.from(appIconSvg({ maskable }))).resize(size, size);
  if (flatten) pipeline = pipeline.flatten({ background: flatten });
  await pipeline.png().toFile(join(target, to));
  console.log(`appicons: ${to} (${size}x${size})`);
}
