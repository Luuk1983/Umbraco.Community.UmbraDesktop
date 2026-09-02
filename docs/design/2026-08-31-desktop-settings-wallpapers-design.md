# Desktop settings & wallpapers — Design

> A **Desktop settings** dialog for UmbraDesktop, carrying one setting today — the desktop
> wallpaper — and shaped so skins and other options slot in later without restructuring.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-08-31
- **Branch:** `feature/2_desktop_background`
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

The launcher footer already has a **Desktop settings** button, rendered `disabled`
([launcher.element.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/launcher.element.ts)).
This design activates it.

**In scope**

- A centered **Desktop settings** dialog, laid out as a list of sections.
- One section: **Wallpaper** — current thumbnail plus two buttons, *Built-in images* and
  *Media library*.
- Eight built-in wallpapers shipped in the package, plus a **None** option that restores the
  current gradient.
- Any Media Library image as a wallpaper, resized server-side by Umbraco.
- Per-user, per-browser persistence.

**Out of scope** — listed in §12.

**Everything here is frontend.** No C# is added: no controllers, no DTOs, no migrations, no
OpenAPI client regeneration. The global rule "test-first for all backend code" therefore has
nothing to bind to; §10 sets out the frontend testing approach instead.

---

## 2. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | Consumers add their own wallpapers **via the Media Library**, not a folder or config key | No new convention to document, no deploy, and `UmbImagingRepository` gives resizing and thumbnails for free. Avoids the package's first backend endpoint. |
| D2 | Settings persist in **`localStorage`, keyed by user** | Matches §8 of the main design, which already committed window layout to `localStorage`. Zero backend. Accepted cost: no roaming between browsers or devices. |
| D3 | Built-in images are **compressed and catalogued at build time** | You drop a PNG in a folder; the build encodes it and regenerates the catalogue. Compression never becomes a manual chore, and quality can't drift between images. |
| D4 | Built-ins ship as **AVIF at native resolution** | AVIF has been available across every evergreen browser since Edge 121 (Jan 2024), and the v17 backoffice already requires evergreen. Native resolution because the sources are 1672×941 — upscaling adds bytes, not detail. |
| D5 | The settings modal is **centered**; pickers are **sidebars** | Matches backoffice convention: you configure in the middle, you pick from the side. |
| D6 | The settings modal uses **standard `umb-body-layout` dialog chrome**, not custom window-style chrome | Focus trapping, Escape and scroll behaviour come free, and a dialog that looks like a desktop window but can't be dragged reads as broken. Revisit once the content settles. |
| D7 | Wallpapers scale with **`cover`**, centred | `contain` letterboxes, `100% 100%` distorts. See §7. |
| D8 | Source PNGs are **committed** to `wallpapers-src/` | ~11MB, in exchange for a build any contributor can reproduce. The alternative — committing only the AVIF output — puts the source of truth outside the repo. |
| D9 | Built-in wallpaper names are **English-only**, not localized | They are proper nouns ("Aurora Flow"), the same way app names in a launcher aren't translated. Everything else in the feature is localized. |

---

## 3. Data model & persistence

One `localStorage` key per user:

```
umbradesktop:settings:<userUnique>
```

Keying by user prevents two accounts on a shared machine from inheriting each other's desktop.
The payload is versioned from day one so a future shape change has somewhere to hang a
migration:

```ts
/** Persisted desktop settings for one user. */
interface UmbraDesktopSettings {
  v: 1;
  wallpaper: UmbraDesktopWallpaperRef;
  pinned: string[]; // launcher Favourites, in pin order
}

/** Where a wallpaper comes from. */
type UmbraDesktopWallpaperRef =
  | { kind: 'none' }                      // the existing gradient
  | { kind: 'builtin'; id: string }       // a slug from the generated catalogue
  | { kind: 'media'; unique: string };    // a Media Library item key
```

**Every read path degrades to the default rather than throwing.** Missing key, unparseable
JSON, unknown `v`, a `builtin` id that no longer exists (an image dropped in an upgrade), or a
`media` item that has been deleted or unpublished — all resolve to
`UMBRADESKTOP_DEFAULT_WALLPAPER_ID`. A blank or broken desktop is a far worse failure than a
silently reset preference. `localStorage` access is wrapped: private-mode and
storage-disabled browsers fall back to in-memory state for the session.

Within a payload this build understands, **each field recovers independently** — an unreadable
wallpaper reference must not cost the user their Favourites, or vice versa. Writes go through a
merge rather than a replace, for the same reason. `pinned` is seeded with
`['content', 'media', 'log-viewer']` only when *nothing* is stored: a user who deliberately
unpins everything keeps an empty list rather than having the seed reappear.

### Context

`UmbraDesktopSettingsContext` is provided by `desktop.element`, alongside the existing window
manager and app catalogue contexts. It exposes an observable of the current settings and a
setter that writes through to storage. Parsing, validation and serialisation live in a
separate **pure** `settings-store.ts` with no DOM or storage dependency, so the fallback matrix
above is directly unit-testable.

---

## 4. The built-in wallpapers

Eight images, all 1672×941, curated from twelve candidates.

| Slug | Display name | Character |
|---|---|---|
| **`aurora-flow`** | Aurora Flow | Navy, blue→pink ribbon, embossed U. **The default.** |
| `golden-valley` | Golden Valley | Painterly sunset valley, U as the sun. |
| `dusk-horizon` | Dusk Horizon | Flat-vector dusk landscape, U as a moon over water. |
| `midnight-wave` | Midnight Wave | Dark blue/purple wave, large faint U. The quietest. |
| `ember-glow` | Ember Glow | Near-black, small glowing orange U. |
| `blueprint-core` | Blueprint Core | Navy HUD, glowing U in concentric rings. |
| `ribbon-candy` | Ribbon Candy | Cream/coral/blue ribbons. The one light option. |
| `retro-swoosh` | Retro Swoosh | The 2010 "the friendly cms" swoosh. Novelty. |

Plus a **None** entry, listed first, which restores the gradient that ships today — so the
feature never takes an option away.

`UMBRADESKTOP_DEFAULT_WALLPAPER_ID = 'aurora-flow'`. The generator **fails the build** if that
slug is absent from the catalogue, so removing the default image can't silently ship.

**Two candidates were cut** and are not in the repo (originals retained outside it): a
folded-paper geometric — hard diagonal fold shadows behind white windows — and a brushed-metal
retro piece, redundant against Ember Glow and carrying text that any window would slice.

**Two further images are marketing art, not wallpaper**, and now live in `docs/images/` as
`umbradesktop-hero.png` and `umbradesktop-isometric.png`. Both depict a windowed desktop;
real windows on top of illustrated windows reads as a rendering fault. They are candidates for
the README banner and the Marketplace listing.

---

## 5. Build pipeline

```
backoffice/wallpapers-src/<slug>.png          ← you drop files here (committed)
        │  npm run build → scripts/build-wallpapers.mjs (sharp)
        ▼
backoffice/public/wallpapers/<slug>.avif        full size, native resolution
backoffice/public/wallpapers/<slug>.thumb.avif  480px wide
backoffice/src/desktop/settings/wallpapers.generated.ts
        │  vite build (copies public/ → outDir)
        ▼
wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/<slug>.avif
```

**Why `public/` and not `wwwroot/` directly.** `vite.config.ts` sets `emptyOutDir: true` on the
wwwroot plugin folder, so anything placed there by hand is wiped on the next build. Vite's
`public/` directory is copied into the output verbatim — the same route
`umbraco-package.json` already takes. From there the Razor SDK packs them as static web assets,
served at `/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/…`.

**The generated catalogue** (`wallpapers.generated.ts`, committed):

```ts
export interface UmbraDesktopBuiltInWallpaper {
  id: string;            // slug, from the filename
  name: string;          // "aurora-flow" → "Aurora Flow"
  url: string;
  thumbUrl: string;
  averageColour: string; // "#1a1f3d", painted under the image while it decodes
}
```

Encoding is **idempotent** — a source whose output is newer than it is skipped — so a local
rebuild costs nothing. The check is mtime-based, and git does not preserve mtimes, so a fresh
clone (CI included) re-encodes everything once; `sharp` is deterministic, so that produces no
diff. The script scans only the top level of `wallpapers-src/`, so a subfolder is a safe place
to stage work in progress.

`public/wallpapers/` **is committed**, so the images are reviewable and a developer who never
runs the wallpaper build still has them. `wwwroot/App_Plugins/` is **not** — `.gitignore:365`
excludes it, and vite regenerates it from `public/` on every build. CI runs `npm ci` before
`npm run build`, so `sharp` is present there as a devDependency.

`sharp` is added as a **devDependency**, and the encode is chained into `npm run build` and
`npm run watch` (also exposed on its own as `npm run wallpapers`). Only the filename→slug/name
derivation is non-trivial, so it lives in `scripts/wallpaper-naming.mjs` as plain JS and is
unit-tested (§10).

---

## 6. UI

```
Launcher footer ─ Desktop settings (currently disabled)
   └─▶ Settings dialog  ······································· centered
         └─ Wallpaper section: [ thumbnail ]  Built-in images │ Media library
                                                    │              │
                                                    ▼              ▼
                                    Wallpaper picker      UMB_MEDIA_PICKER_MODAL
                                    (grid of 8 + None)    (core, images filtered)
                                              sidebar            sidebar
```

**Settings dialog** — `type: 'dialog'`, alias
`Umbraco.Community.UmbraDesktop.Modal.Settings`. Sections stack vertically; today there is one.
The Wallpaper section's thumbnail shows the current image, or a swatch of the gradient itself
when **None** is selected — never an empty frame.
Adding skins later means appending a section, not restructuring. Close is the only exit — no
OK/Cancel, because selections apply immediately, consistent with the rest of the desktop.

**Wallpaper picker** — `type: 'sidebar'`, size `medium`, alias
`…Modal.WallpaperPicker`. A responsive grid of 16:9 thumbnails with the current one marked
selected; **None** first. Picking closes the sidebar and returns to the settings dialog with
the thumbnail updated.

**Media library** — the core `UMB_MEDIA_PICKER_MODAL`, with `pickableFilter` excluding folders
and items the user has no access to. It returns `{ selection: Array<string | null> }`; we take
the first entry as the media unique.

Restricting the picker to *image* types is deliberately not attempted: core does it by first
resolving the site's folder and image media types over the network, which is more machinery than
this earns. Instead the choice is validated on the way back — `setMediaWallpaper` resolves the
resized URLs **before** storing anything, and a file Umbraco cannot render as an image is
reported through a warning notification with nothing persisted. The alternative, storing a
reference that silently resolves to the default forever after, would be a worse failure.

Both modals are registered as `type: 'modal'` manifests in a new `settings/manifest.ts`, added
to `bundle.manifests.ts`. New localization keys go into both `en.ts` and `nl.ts`.

---

## 7. Rendering

`desktop.element` sets CSS custom properties on `.desktop` from the resolved wallpaper; the
existing gradient remains the `none` branch, untouched. When an image is active it
additionally:

- paints the catalogue's **average colour** underneath, so there is no flash before decode;
- lays a **12% black scrim** over the image. Enough to keep white windows separated from the
  light wallpapers (Ribbon Candy, Retro Swoosh) while barely touching the dark ones. The 20%
  originally proposed flattened Golden Valley and pushed Ember Glow to black;
- **hides the Umbraco watermark** (`.wallpaper-brand`), which reads as dirt over a photograph.

Sizing is `cover` / `center` / `no-repeat`, painted **edge to edge across the whole desktop,
including behind the taskbar** — stopping the image at the taskbar line only draws attention to
the seam. The taskbar keeps its own surface on top.

All sources are 16:9. A desktop surface (viewport minus the 50px taskbar) is marginally wider,
so `cover` shaves a few pixels off top and bottom. An ultrawide crops around a quarter of the
height; every image has its subject centred and survives it.

**Media-sourced wallpapers** resolve through:

```ts
UmbImagingRepository.requestResizedItems([unique], {
  width: 2560, mode: ImageCropModeModel.Max, format: 'webp',
})
```

`Max` never upscales, so a small upload is served at its own size. This is why media wallpapers
are WebP while built-ins are AVIF: ImageSharp, behind Umbraco's imaging endpoint, cannot
*encode* AVIF. Both are just CSS background images, so the difference is invisible. A 12MB PNG
upload still reaches the browser as a sane, server-cached, resized file — the dynamic
compression question, answered at no cost to us.

---

## 8. What consumers do

Documented in the README as: upload an image to the Media Library, open **Desktop settings →
Media library**, pick it. No configuration, no deploy, no folder convention, and Umbraco
handles the optimisation.

What this deliberately does *not* offer is an install-wide default an administrator can push to
every user — that needs server-side storage and is listed in §12.

---

## 9. Module layout

New, under `backoffice/src/desktop/settings/`:

| File | Purpose |
|---|---|
| `types.ts` | `UmbraDesktopSettings`, `UmbraDesktopWallpaperRef` |
| `settings-store.ts` | **Pure.** Parse / validate / serialise / fallback |
| `settings.context.ts` + `.context-token.ts` | Observable settings, provided by `desktop.element` |
| `wallpaper.ts` | **Pure.** Resolve a ref → background URL, thumbnail URL, average colour |
| `wallpapers.generated.ts` | Build output, committed |
| `manifest.ts` | The two modal manifests |
| `settings-modal.token.ts`, `wallpaper-picker-modal.token.ts` | `UmbModalToken`s |
| `components/settings-modal.element.ts` | Centered dialog |
| `components/wallpaper-picker-modal.element.ts` | Sidebar grid |

New elsewhere: `backoffice/scripts/build-wallpapers.mjs`,
`backoffice/scripts/wallpaper-naming.mjs`, `backoffice/wallpapers-src/*.png` (8 files).

Changed: `desktop.element.ts` (provide context, apply wallpaper), `launcher.element.ts` (enable
the button), `desktop/constants.ts` (default id), `localization/en.ts` + `nl.ts`,
`bundle.manifests.ts`, `package.json` (chain the wallpaper build), `README.md`.

Each new module has one job and a stated dependency: the store knows storage but not the DOM,
`wallpaper.ts` knows the catalogue but not storage, the context wires them, and the elements
render. `launcher.element.ts` is already 463 lines; the settings UI goes in its own files
rather than growing it further.

---

## 10. Testing

The repo's harness is `web-test-runner`, and its existing suite covers **pure logic plus one
DOM helper** (`chrome-injector`). This feature follows that line, tests first:

| Module | Cases |
|---|---|
| `settings-store` | Round-trip; missing key; malformed JSON; unknown `v`; unknown `builtin` id; each falls back to the default. Per-user key isolation. `localStorage` throwing (private mode) degrades to in-memory. |
| `wallpaper` | Each `kind` resolves to the right URL and average colour; `none` yields no image; unknown ids fall through to the default. |
| `pinned` | Toggling appends when absent and removes when present, preserves pin order, and never mutates its input. |
| `wallpaper-naming` | `aurora-flow.png` → `{ id: 'aurora-flow', name: 'Aurora Flow' }`; multi-hyphen names; non-image files ignored. |

Modal elements are not unit-tested, consistent with the current suite. They are verified by
running the TestInstance: open the launcher, change the wallpaper, reload, confirm it persists,
then check a Media-sourced image and a deleted-media fallback.

---

## 11. Risks

| # | Item | Note |
|---|---|---|
| W1 | Modal z-index above the desktop | The taskbar sits at `z-index: 1000000` and the desktop hides the backoffice header. `umbOpenModal` already works here — the launcher opens `UMB_SEARCH_MODAL` today — so modals render in the shell's container above the desktop. Confirm visually for the sidebar case. |
| W2 | `sharp` on contributor machines | A native dependency, and it now runs as part of `npm run build`, so a machine where it fails to install cannot build the frontend at all. Prebuilt binaries cover Windows/macOS/Linux on Node 22, which is what CI uses. |
| W3 | Softness on large displays | Blueprint Core and Retro Swoosh have crisp edges and dot patterns that go soft upscaled to 2560px. Accepted — regenerating the sources isn't practical, and behind windows under a scrim it doesn't read. |
| W4 | `UMB_MEDIA_PICKER_MODAL` shape across the v17 line | A soft coupling to a core modal token, same class of risk as R3 in the main design. The value type `{ selection }` is stable API. |

---

## 12. Out of scope

- **Skins** — the section-list structure anticipates them; nothing is built.
- An **install-wide default** an administrator sets for all users (needs server storage).
- **Roaming** settings across browsers or devices (D2).
- Per-wallpaper **fit modes**, tiling, or a configurable scrim.
- Wallpaper on the **header-app launcher** or anywhere outside the desktop section.
