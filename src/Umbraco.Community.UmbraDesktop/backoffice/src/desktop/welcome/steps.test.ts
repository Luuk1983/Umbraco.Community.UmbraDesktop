import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_WELCOME_PAGES, welcomeButtons } from './steps';

/**
 * What the button row shows on each page (design doc D4).
 *
 * Every page has a visible default, so the main button always means "go on with what is selected":
 * Next, and Done on the last page. Never Skip. Back appears from the second page on.
 */

it('asks language first, then theme, then whether to open the desktop on sign-in', () => {
  expect(UMBRADESKTOP_WELCOME_PAGES).to.deep.equal(['language', 'theme', 'sign-in']);
});

it('reads Next on every page but the last', () => {
  expect(welcomeButtons(0).primaryKey).to.equal('umbraDesktop_welcomeNext');
  expect(welcomeButtons(1).primaryKey).to.equal('umbraDesktop_welcomeNext');
});

it('reads Done on the last page', () => {
  expect(welcomeButtons(UMBRADESKTOP_WELCOME_PAGES.length - 1).primaryKey).to.equal('umbraDesktop_welcomeDone');
});

it('offers no way back from the first page', () => {
  expect(welcomeButtons(0).back).to.equal(false);
});

it('offers a way back from every later page', () => {
  expect(welcomeButtons(1).back).to.equal(true);
  expect(welcomeButtons(2).back).to.equal(true);
});

it('knows which page is the last', () => {
  expect(welcomeButtons(0).last).to.equal(false);
  expect(welcomeButtons(2).last).to.equal(true);
});
