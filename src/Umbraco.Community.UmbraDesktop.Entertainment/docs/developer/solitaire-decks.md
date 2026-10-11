---
id: solitaire-decks
title: Adding a card back or a card face set to Solitaire
description: Ship a card back or a set of card faces for Solitaire from your own package, without touching this one.
sidebar_position: 1
---

# Adding a card back or a card face set to Solitaire

How to ship a card back or a set of card faces for the Solitaire game in the Entertainment package,
from your own package. For why the two are separate things, see
the Solitaire design document (`docs/design/2026-09-30-solitaire-design.md`, D7 and D11). The mechanics of putting an element on the desktop at all are in
[Building a desktop app](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-apps.md)
in the UmbraDesktop developer guide.

The Entertainment package declares two extension manifest types. Solitaire reads whatever is
registered under them, lists it in its settings, and stores the player's choice by alias. The
package's own backs and face set are registered through the same types, so the path you are about to
use is the one the game itself uses. The built-in backs are Match theme (the default, which has one
image per theme), Rabbit, Codegarden, CodeCabin and Dutch Umbraco Alliance.

A face set is the 52 fronts. A back is one image. They combine freely: any back with any face set.
So you never ship one face set per theme, and a new back works with every face set.

---

## 1. The two manifest types

Both come from `solitaire/extensions.ts` in the Entertainment package.

```ts
import type { ManifestBase } from '@umbraco-cms/backoffice/extension-api';

type Suit = 'S' | 'H' | 'D' | 'C';

/** One card to draw. */
export interface SolitaireCardValue {
  readonly suit: Suit;
  readonly rank: number;    // 1 = ace, 11 = jack, 12 = queen, 13 = king
}

/**
 * A face set: draws any card as a self-contained SVG document with viewBox `0 0 100 140`. Each
 * SVG is embedded in a shadow root with 51 others, so ids inside the SVG must be unique per
 * card to avoid clashing in shared CSS.
 */
export interface SolitaireFaceSet {
  /**
   * Render one card as SVG.
   * @param card The card.
   * @returns SVG markup.
   */
  render(card: SolitaireCardValue): string;
}

/**
 * A back's image: one URL, or one per theme id with a fallback for ids it does not know.
 * Theme ids are lowercase identifiers like `win98` or `macos`.
 */
export type SolitaireBackImage =
  | string
  | { readonly byTheme: Readonly<Record<string, string>>; readonly fallback: string };

/** A card back. */
export interface ManifestSolitaireBack extends ManifestBase {
  type: 'umbraDesktopSolitaireBack';
  meta: {
    /** Shown under the swatch in settings. A `#`-prefixed localisation token or a literal. */
    label: string;
    image: SolitaireBackImage;
  };
}

/** A face set. */
export interface ManifestSolitaireFaces extends ManifestBase {
  type: 'umbraDesktopSolitaireFaces';
  /** Loads the module whose default export is the face set. Lazy, so 52 SVGs stay out of the main chunk. */
  loader: () => Promise<{ default: SolitaireFaceSet }>;
  meta: { label: string };
}

/** Adds both types to Umbraco's manifest union. A global augmentation: nothing is exported. */
declare global {
  interface UmbExtensionManifestMap {
    umbraDesktopSolitaireBack: ManifestSolitaireBack;
    umbraDesktopSolitaireFaces: ManifestSolitaireFaces;
  }
}
```

Both extend Umbraco's `ManifestBase`, so `alias`, `name` and `weight` work as they do everywhere.
The settings modal sorts by `weight`, higher first. The five themes the desktop ships are
`umbraco`, `umbraco4`, `macos`, `win11` and `win98`, but a back should not assume that list is
complete.

The Entertainment package does not publish these types as a library. Copy the snippet above into
a `.ts` file of your own (it is `extensions.ts` with the `Suit` type inlined and the
`UmbExtensionManifestMap` augmentation, which adds the two type names to Umbraco's manifest union,
included). The manifest itself
is plain data, so nothing from the Entertainment package is needed at runtime.

---

## 2. A card back

A back is an image and a label. This one has its own picture for two themes and a fallback for
everything else, including themes that do not exist yet.

```ts
import type { ManifestSolitaireBack } from './solitaire-types.js';

const BASE = '/App_Plugins/My.Package/solitaire/';

export const manifests: Array<ManifestSolitaireBack> = [
  {
    type: 'umbraDesktopSolitaireBack',
    // Namespaced with your package id, and final once shipped: see section 4.
    alias: 'My.Package.Solitaire.Back.Harbour',
    name: 'Solitaire back: harbour',
    weight: 450,
    meta: {
      label: '#myPackage_solitaireBackHarbour',
      image: {
        byTheme: {
          macos: BASE + 'harbour-light.avif',
          win98: BASE + 'harbour-dither.svg',
        },
        fallback: BASE + 'harbour.avif',
      },
    },
  },
];
```

If your back looks the same everywhere, `image` is just the URL string:

```ts
meta: { label: 'Harbour', image: BASE + 'harbour.avif' }
```

The game adds a white frame (padding of 5% of the card's width), rounds the image and fills the
area inside it, 9 by 13 in proportion, with `object-fit: cover`. So supply a 9:13 image and do not
draw a border: the frame is the game's. For an SVG that means `viewBox="0 0 90 130"`: a 100 by 140
box is cropped on its sides. The built-in backs are AVIF and SVG.

---

## 3. A face set

A face set is a module. Its default export has one method, `render`, which returns the markup of one
SVG document for one card. The manifest points at it with a loader, so the drawings stay out of your
main bundle until they are needed.

The module:

```ts
import type { SolitaireCardValue, SolitaireFaceSet } from './solitaire-types.js';

const RED = '#b3261e';
const INK = '#16204a';

// Four suit shapes, each drawn inside a 100 by 100 box.
const SUIT_PATH: Record<string, string> = {
  S: 'M50 6 C30 30 10 44 10 62 C10 76 22 84 34 80 C40 78 44 74 46 70 C46 84 42 94 34 100 L66 100 C58 94 54 84 54 70 C56 74 60 78 66 80 C78 84 90 76 90 62 C90 44 70 30 50 6 Z',
  H: 'M50 94 C10 62 6 38 26 26 C38 20 48 26 50 36 C52 26 62 20 74 26 C94 38 90 62 50 94 Z',
  D: 'M50 6 L88 50 L50 94 L12 50 Z',
  C: 'M50 8 C38 8 32 18 38 30 C26 24 10 32 14 48 C18 62 34 62 44 54 C44 70 40 84 34 94 L66 94 C60 84 56 70 56 54 C66 62 82 62 86 48 C90 32 74 24 62 30 C68 18 62 8 50 8 Z',
};

const RANKS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

const simple: SolitaireFaceSet = {
  render(card: SolitaireCardValue): string {
    const colour = card.suit === 'H' || card.suit === 'D' ? RED : INK;
    const label = RANKS[card.rank] ?? String(card.rank);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">` +
      `<rect x=".5" y=".5" width="99" height="139" rx="6" fill="#fffdf7" stroke="rgba(22,32,74,.2)"/>` +
      `<text x="10" y="22" font-family="Georgia, serif" font-weight="700" font-size="16" fill="${colour}">${label}</text>` +
      // The id carries the rank and suit, so no two cards share one.
      `<g id="suit-${card.rank}${card.suit}" transform="translate(25 35) scale(.5)" fill="${colour}">` +
      `<path d="${SUIT_PATH[card.suit]}"/></g>` +
      `</svg>`
    );
  },
};

export default simple;
```

The manifest:

```ts
import type { ManifestSolitaireFaces } from './solitaire-types.js';

export const manifests: Array<ManifestSolitaireFaces> = [
  {
    type: 'umbraDesktopSolitaireFaces',
    alias: 'My.Package.Solitaire.Faces.Simple',
    name: 'Solitaire faces: simple',
    weight: 450,
    loader: () => import('./simple-faces.js'),
    meta: { label: '#myPackage_solitaireFacesSimple' },
  },
];
```

Add both arrays to your bundle's manifest list, as you would any extension. There is nothing extra to
supply for the preview in settings: it is the king of spades, drawn by your own `render`.

Draw inside the `0 0 100 140` box and include the card's own outline and rounded corners. The game
does not add a frame, and a face set has no say over how cards are laid out, sized or moved.

---

## 4. The rules that matter

Each of these is here because it bit during the build, or would.

- Ids inside a face's SVG must be unique per card. All 52 cards share one shadow root, so a
  gradient, clip path or filter with `id="shadow"` on every card means every card uses the first
  one. Put the rank and suit in the id, as the example does, or avoid ids altogether.
- Aliases are final once shipped. The player's choice is stored by alias. Rename one and everyone
  who chose it falls back to the default. A stored alias that no longer exists, for instance because
  your package was uninstalled, reads as the default without complaint. Namespace your aliases with
  your package id, which also keeps them from colliding with anyone else's.
- Images are served from your package's own `App_Plugins` folder. Ship them under
  `wwwroot/App_Plugins/<your package id>/` and give the manifest that path. Do not point at the
  Entertainment package's files or the host's: your package would then depend on a path you do not
  own.
- A face set is theme-independent and a back may vary by theme. Paper cards look the same on every
  table, so do not branch your `render` on the theme. A back is where the theme shows, through
  `byTheme`. Always give a `fallback`, because a theme you have never heard of is a supported case.
- A label can be a `#token`. Ship a dictionary in your package with the token in it and the settings
  modal shows it in the player's language. A label without a leading `#` is shown as written.
- A face must be self-contained: an `xmlns`, no external references, and no web fonts or page CSS.
  When a game is won, the cascade turns each face into a `data:image/svg+xml` image, and inside
  one of those nothing from the page applies, so a face that relies on the page's fonts or
  stylesheets is drawn differently there (or not at all).
- Keep `render` pure. It takes a card and returns markup, with no fetching, no state and no reading
  of the document.
- Weight is Umbraco's convention: higher sorts first. The built-in backs are Match theme at 1000,
  Rabbit at 900, Codegarden at 800, CodeCabin at 700 and Dutch Umbraco Alliance at 600, and the face set is at 1000.
  Use a number that none of those use, such as 450 to appear after them all, or above 1000 to appear first. A tie has no defined
  order.

---

## 5. Checklist before you ship

- [ ] The alias is namespaced with your package id and you are happy to keep it forever
- [ ] The back has a `fallback`, and every image URL starts with `/App_Plugins/<your package id>/`
- [ ] Every face is an SVG with `viewBox="0 0 100 140"` and draws its own outline
- [ ] No two cards in your set produce the same id
- [ ] Every face is self-contained: `xmlns` present, no external references, no web fonts or page CSS
- [ ] All 52 cards render: ranks 1 to 13 in all four suits, none throwing
- [ ] Labels work as tokens in every language you ship, or are plain literals
- [ ] The set looks right under all five themes, and the back under an unknown theme id
