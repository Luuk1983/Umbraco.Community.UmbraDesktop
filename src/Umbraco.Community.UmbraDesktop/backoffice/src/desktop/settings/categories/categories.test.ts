import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_SETTINGS_CATEGORIES, findSettingsCategory } from './index.js';
import en from '../../localization/en.js';
import nl from '../../localization/nl.js';

/**
 * A category is a folder plus one entry in the registry, and everything the panel needs in order to
 * draw its row comes from that entry: a name, a line saying what the category is for, an icon and
 * the element behind it. What is tested here is that all four are real — a label key with no string
 * behind it renders as its own token, and an element nobody imported renders as an empty screen.
 */

/** The terms one language actually ships, by key. */
const terms = (set: unknown) => (set as Record<string, Record<string, string>>).umbraDesktop;

it('puts General first', () => {
  // Where every settings surface that has a General puts it: it is the category you fall back to
  // when you are not sure which one holds the thing you want, and a fallback at the bottom is one
  // people scroll past twice.
  expect(UMBRADESKTOP_SETTINGS_CATEGORIES.map((category) => category.id)).to.deep.equal(['general', 'appearance']);
});

it('gives every category an icon and an element that exists', () => {
  for (const category of UMBRADESKTOP_SETTINGS_CATEGORIES) {
    expect(category.icon, `${category.id} icon`).to.match(/^icon-/);
    // Importing the registry is what defines the tag. A category whose element module was never
    // imported would render an empty custom element and look like a category with nothing in it.
    expect(customElements.get(category.tag), `${category.id} element "${category.tag}" is not defined`).to.not.equal(
      undefined,
    );
  }
});

it('names and describes every category, in every language', () => {
  // A key with no string behind it does not fail anywhere — it renders as "umbraDesktop_groupX" in
  // the panel, which is how a missing translation reaches a user.
  for (const category of UMBRADESKTOP_SETTINGS_CATEGORIES) {
    for (const [language, set] of [
      ['en', en],
      ['nl', nl],
    ] as const) {
      for (const key of [category.labelKey, category.descriptionKey]) {
        expect(key, `${category.id} key`).to.match(/^umbraDesktop_/);
        expect(terms(set)[key.replace('umbraDesktop_', '')], `${language} is missing ${key}`).to.be.a('string');
      }
    }
  }
});

it('describes what a category is for, not what is set inside it', () => {
  // The row used to summarise the settings — "Umbraco, Blueprint Core" — which reads as a list of
  // words you can only interpret once you already know what the category holds. Descriptions work
  // the other way round, and say the same thing before the settings have loaded as after.
  expect(terms(en).groupAppearanceAbout).to.contain('theme');
  expect(terms(en).groupGeneralAbout).to.contain('starts');
});

it('finds a category by id, and nothing for one that was never there', () => {
  // A deep link can name a category from a version that had it, or a typo. Either way the panel
  // shows the list rather than an empty screen.
  expect(findSettingsCategory('appearance')?.id).to.equal('appearance');
  expect(findSettingsCategory('taskbar')).to.equal(undefined);
  expect(findSettingsCategory(undefined)).to.equal(undefined);
});
