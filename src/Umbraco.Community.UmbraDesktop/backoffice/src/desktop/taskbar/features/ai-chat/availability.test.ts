import { expect } from '@open-wc/testing';
import type { UmbraDesktopApp } from '../../../types';
import { catalogue } from '../../../catalogue/index.js';
import { UMBRADESKTOP_AI_CHAT_APP_ALIAS, aiChatAvailability } from './availability.js';
import en from '../../../localization/en.js';
import nl from '../../../localization/nl.js';

/**
 * Two surfaces, one rule each, and they are allowed to disagree. The row shows the chat only when
 * the user can actually launch it; settings lists it either way and has to say *why* it cannot be
 * switched on. "Not installed" and "you cannot reach it" are different sentences to the person
 * reading them — one is a job for whoever manages the site's packages, the other for whoever
 * manages its users — so this distinguishes them rather than offering one apologetic line.
 */

/** The terms one language actually ships, by key. */
const terms = (set: unknown) => (set as Record<string, Record<string, string>>).umbraDesktop;

/** A stand-in app. Only the alias is read here. */
const app = (alias: string): UmbraDesktopApp =>
  ({ alias, name: alias, icon: 'icon-chat', content: { kind: 'iframe', url: '' }, chromeProfile: 'full-section' });

/** The chat's own catalogue entry, which is where its `ref` comes from. */
const REF = catalogue.entries.find((entry) => entry.alias === UMBRADESKTOP_AI_CHAT_APP_ALIAS)?.ref;

it('still has a catalogue entry to take its ref from', () => {
  // The one alias this feature hardcodes. If the catalogue entry is ever renamed, the feature goes
  // permanently unavailable and says the AI package is not installed on sites that have it.
  expect(REF, `no catalogue entry aliased "${UMBRADESKTOP_AI_CHAT_APP_ALIAS}"`).to.be.a('string');
});

it('is available when the chat is in the apps this user may launch', () => {
  const verdict = aiChatAvailability([app('content'), app(UMBRADESKTOP_AI_CHAT_APP_ALIAS)], () => true, REF);
  expect(verdict.available).to.equal(true);
});

it('blames the missing permission when the package is installed but the app never arrived', () => {
  // The catalogue filters entries against the user's permitted sections before anything here sees
  // them, so an absent app on an install whose manifest is registered can only be permission.
  const verdict = aiChatAvailability([app('content')], (ref) => ref === REF, REF);
  expect(verdict.available).to.equal(false);
  expect(verdict.available === false && verdict.reasonKey).to.equal('umbraDesktop_taskbarAiChatNoPermission');
});

it('blames the missing package when nothing registered the chat section', () => {
  const verdict = aiChatAvailability([app('content')], () => false, REF);
  expect(verdict.available).to.equal(false);
  expect(verdict.available === false && verdict.reasonKey).to.equal('umbraDesktop_taskbarAiChatNotInstalled');
});

it('reads a catalogue with no such entry as a missing package', () => {
  // Not a state a shipped build can reach — the test above is what keeps it that way — but the
  // registry lookup takes a `ref | undefined`, and "cannot be installed" is the honest answer.
  const verdict = aiChatAvailability([app('content')], () => true, undefined);
  expect(verdict.available === false && verdict.reasonKey).to.equal('umbraDesktop_taskbarAiChatNotInstalled');
});

it('translates both reasons, in every language', () => {
  for (const [language, set] of [
    ['en', en],
    ['nl', nl],
  ] as const) {
    for (const key of ['taskbarAiChatNotInstalled', 'taskbarAiChatNoPermission']) {
      expect(terms(set)[key], `${language} is missing umbraDesktop_${key}`).to.be.a('string');
    }
  }
});
