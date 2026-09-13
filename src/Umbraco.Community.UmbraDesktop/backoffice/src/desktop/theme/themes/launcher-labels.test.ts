import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';

/**
 * No theme may give an app tile a width it must have.
 *
 * The base launcher keeps long app names inside their tiles with two rules working together:
 * `min-width: 0` on the grid item, so a column can be narrower than its longest word, and
 * `overflow-wrap: anywhere` on the label, so there is always somewhere to break. Take either away
 * and `repeat(n, 1fr)` stops being n equal columns, the grid grows past its card, and a label
 * paints over the group beside it — which is how this was found, in Dutch, where
 * "Documenttype-machtigingen" is simply longer than "Document Type permissions".
 *
 * Themes inherit that today because none of them names those properties: a theme sheet is appended
 * after the component's own styles and overrides only what it mentions. So this is a guard on the
 * *next* theme rather than a complaint about the five that ship. It is the "a theme may restyle,
 * never remove" rule applied to a layout guarantee instead of to an affordance, and a text-level
 * check is the right shape for it: the thing being forbidden is a declaration, not a measurement.
 *
 * Reading the parsed sheet rather than the source string, so a property written in a shorthand or a
 * nested block is seen the way the browser sees it.
 */

/** The properties that would reintroduce a floor under a tile's width, and what each would do. */
const FORBIDDEN: ReadonlyArray<{ property: string; banned: (value: string) => boolean; why: string }> = [
  {
    property: 'min-width',
    banned: (value) => value !== '0' && value !== '0px' && value !== 'auto' && value !== '',
    why: 'pins the column open, so one long name widens the whole grid',
  },
  {
    property: 'white-space',
    banned: (value) => value.startsWith('nowrap') || value.startsWith('pre'),
    why: 'stops the label wrapping, so it overflows its tile instead',
  },
  {
    property: 'overflow-wrap',
    banned: (value) => value === 'normal',
    why: 'takes away the only break opportunity inside a long word',
  },
  {
    property: 'word-break',
    banned: (value) => value === 'keep-all',
    why: 'forbids breaking inside a word, which is where the break has to happen',
  },
];

/** Selectors that reach a tile or its label, and so could undo the base rules. */
const TILE_SELECTOR = /\.tlb|\.tile|\.launch|\.grid/;

/**
 * Every style rule in a theme's launcher sheet that touches a tile.
 * @param sheet The theme's parsed launcher stylesheet.
 * @returns The matching rules.
 */
function tileRules(sheet: CSSStyleSheet): CSSStyleRule[] {
  return [...sheet.cssRules].filter(
    (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && TILE_SELECTOR.test(rule.selectorText),
  );
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name} leaves an app tile free to be as narrow as its column`, async () => {
    const sheets = await theme.sheets?.();
    const sheet = sheets?.launcher?.styleSheet;
    // A theme that restyles no launcher at all has nothing to take away, which is a pass rather
    // than a skip: the base rules are what such a theme renders.
    if (!sheet) return;

    for (const rule of tileRules(sheet)) {
      for (const { property, banned, why } of FORBIDDEN) {
        const value = rule.style.getPropertyValue(property).trim().toLowerCase();
        expect(
          banned(value),
          `${theme.name}: "${rule.selectorText}" sets ${property}: ${value}, which ${why}`,
        ).to.equal(false);
      }
    }
  });
}
