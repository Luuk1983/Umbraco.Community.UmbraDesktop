import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_TASKBAR_FEATURES, UMBRADESKTOP_TASKBAR_REGIONS, taskbarFeaturesIn } from './index.js';
import en from '../../localization/en.js';
import nl from '../../localization/nl.js';

/**
 * The registry is curated, exactly as the themes, the settings categories and the app catalogue
 * are: a feature is a folder plus one entry here. What is asserted is everything the two surfaces
 * reading this registry need and cannot check for themselves — the taskbar needs a fixed order,
 * and Desktop settings needs a name and a description for every entry whether or not the feature
 * is usable on this install.
 */

/** The terms one language actually ships, by key. */
const terms = (set: unknown) => (set as Record<string, Record<string, string>>).umbraDesktop;

it('ships the AI chat first and pinned apps second, both on the launcher side', () => {
  // The order is the shell's and the user cannot change it, which is the whole reason the row is
  // worth building muscle memory for. A test rather than a comment because the order is spread
  // across two folders' weights, where a collision reads as harmless in either file alone.
  expect(taskbarFeaturesIn('launcher').map((feature) => feature.id)).to.deep.equal(['ai-chat', 'pinned-apps']);
});

it('gives every feature a unique id', () => {
  const ids = UMBRADESKTOP_TASKBAR_FEATURES.map((feature) => feature.id);
  expect(new Set(ids).size, 'two features share an id').to.equal(ids.length);
});

it('orders a region by weight and never leaves two entries tied', () => {
  // A tie makes the row's order depend on the order of the array literal, which is the one thing
  // the fixed order must not depend on.
  for (const region of ['launcher', 'tray'] as const) {
    const weights = taskbarFeaturesIn(region).map((feature) => feature.weight);
    expect(new Set(weights).size, `${region} has two features at the same weight`).to.equal(weights.length);
    expect(weights, `${region} is not in weight order`).to.deep.equal([...weights].sort((a, b) => a - b));
  }
});

it('switches every shipped feature on by default', () => {
  // A feature that ships switched off is mostly never found, and both of these are safe to assume
  // somebody wants: they installed the AI package, or they pinned the app themselves.
  for (const feature of UMBRADESKTOP_TASKBAR_FEATURES) {
    expect(feature.defaultEnabled, `${feature.id} should ship on`).to.equal(true);
  }
});

it('names and describes every feature, in every language', () => {
  // Settings lists every feature always, so a key with no string behind it renders as its own
  // token on a row the user is guaranteed to see.
  for (const feature of UMBRADESKTOP_TASKBAR_FEATURES) {
    for (const [language, set] of [
      ['en', en],
      ['nl', nl],
    ] as const) {
      for (const key of [feature.labelKey, feature.descriptionKey]) {
        expect(key, `${feature.id} key`).to.match(/^umbraDesktop_/);
        expect(terms(set)[key.replace('umbraDesktop_', '')], `${language} is missing ${key}`).to.be.a('string');
      }
    }
  }
});

it('names and describes every region, in every language', () => {
  // The region heading is what stops the screen opening on a bare switch from nowhere: it says
  // which part of the taskbar the switches below it are about. A missing string there renders as
  // its own token at the top of the screen, which is the most visible place it could land.
  for (const region of UMBRADESKTOP_TASKBAR_REGIONS) {
    for (const [language, set] of [
      ['en', en],
      ['nl', nl],
    ] as const) {
      for (const key of [region.labelKey, region.descriptionKey]) {
        expect(key, `${region.id} key`).to.match(/^umbraDesktop_/);
        expect(terms(set)[key.replace('umbraDesktop_', '')], `${language} is missing ${key}`).to.be.a('string');
      }
    }
  }
});

it('declares a region for every region a feature claims', () => {
  // `taskbarFeaturesIn` is keyed off this list, so a feature in a region nobody declared is a
  // feature that renders nowhere and is listed in no settings screen — silently.
  const declared = new Set(UMBRADESKTOP_TASKBAR_REGIONS.map((region) => region.id));
  for (const feature of UMBRADESKTOP_TASKBAR_FEATURES) {
    expect(declared.has(feature.region), `${feature.id} is in an undeclared region`).to.equal(true);
  }
});
