import { expect } from '@open-wc/testing';
import { migrationScreenCopy } from './migration-copy';
import en from '../localization/en';

/**
 * What the migration screen says in each of its three states, as keys rather than sentences.
 *
 * Keys, because the screen is localized and a test that pinned English would fail the moment
 * somebody improved the wording, which is the opposite of what a test should encourage. What is
 * worth pinning is that every state has something to say, that the two states a person can leave
 * are the two that offer a way out, and that every key actually exists in the dictionary — which is
 * the failure that otherwise reaches the screen as a raw token.
 */

/** The dictionary section both languages carry, as a plain map. */
const TERMS = (en as unknown as Record<string, Record<string, string>>).umbraDesktop;

it('says what is happening while it works', () => {
  const copy = migrationScreenCopy('running');

  expect(copy.titleKey).to.be.a('string');
  expect(copy.bodyKey).to.be.a('string');
});

it('offers no way out while it works', () => {
  // The one state nobody should be able to walk away from, into a desktop about to change under them.
  expect(migrationScreenCopy('running').dismissKey).to.equal(undefined);
});

it('offers a way out when it is finished', () => {
  expect(migrationScreenCopy('done').dismissKey).to.be.a('string');
});

it('offers a way out when it failed', () => {
  expect(migrationScreenCopy('failed').dismissKey).to.be.a('string');
});

it('says something different in each state', () => {
  const titles = (['running', 'done', 'failed'] as const).map((phase) => migrationScreenCopy(phase).titleKey);

  expect(new Set(titles).size).to.equal(3);
});

it('uses only keys the dictionary actually has', () => {
  // A missing key renders as its own token on a screen that covers the whole desktop, which is about
  // the most visible way this could go wrong.
  for (const phase of ['running', 'done', 'failed'] as const) {
    const copy = migrationScreenCopy(phase);

    for (const key of [copy.titleKey, copy.bodyKey, copy.dismissKey]) {
      if (!key) continue;
      expect(TERMS[key.replace('umbraDesktop_', '')], `${phase}: ${key}`).to.be.a('string');
    }
  }
});
