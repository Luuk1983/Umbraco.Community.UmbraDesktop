import { expect } from '@open-wc/testing';
import './language-page.element.js';
import type { UmbraDesktopWelcomeLanguagePageElement } from './language-page.element.js';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';

/**
 * The language page: every backoffice language as one choice each, the current one selected, and a
 * mark on the ones the desktop is not translated into (design doc D14). The order is tested on the
 * pure list in `languages.test.ts`; this is what a person and a screen reader get from it.
 */

/**
 * Mount the page by hand and wait for its first render.
 * @param cultures The backoffice's cultures.
 * @param value The culture selected.
 * @returns The mounted page.
 */
async function mountPage(cultures: string[], value: string): Promise<UmbraDesktopWelcomeLanguagePageElement> {
  const page = document.createElement('umbradesktop-welcome-language') as UmbraDesktopWelcomeLanguagePageElement;
  page.cultures = cultures;
  page.value = value;
  document.body.appendChild(page);
  await page.updateComplete;
  return page;
}

/**
 * The radio for one culture.
 * @param page The page.
 * @param culture The culture.
 * @returns Its input.
 */
function radio(page: UmbraDesktopWelcomeLanguagePageElement, culture: string): HTMLInputElement {
  return page.renderRoot.querySelector<HTMLInputElement>(`input[value="${culture}"]`)!;
}

/**
 * The fallback mark on one culture's row, if it has one.
 * @param page The page.
 * @param culture The culture.
 * @returns The mark, or null.
 */
function mark(page: UmbraDesktopWelcomeLanguagePageElement, culture: string): HTMLElement | null {
  return radio(page, culture).closest('label')!.querySelector<HTMLElement>('.fallback');
}

afterEach(() => {
  document.querySelectorAll('umbradesktop-welcome-language').forEach((element) => element.remove());
});

it('offers every culture as one choice', async () => {
  const page = await mountPage(['nl', 'es', 'en-us'], 'en-us');

  expect(page.renderRoot.querySelectorAll('input[type="radio"]').length).to.equal(3);
});

it('selects the current language', async () => {
  const page = await mountPage(['nl', 'es', 'en-us'], 'en-us');

  expect(radio(page, 'en-us').checked).to.equal(true);
  expect(radio(page, 'nl').checked).to.equal(false);
});

it('selects the current language whatever its case', async () => {
  const page = await mountPage(['en-us'], 'en-US');

  expect(radio(page, 'en-us').checked).to.equal(true);
});

it('marks a language the desktop is not translated into', async () => {
  const page = await mountPage(['nl', 'es'], 'nl');

  expect(mark(page, 'es')).to.not.equal(null);
});

it('does not mark a language the desktop is translated into', async () => {
  const page = await mountPage(['nl', 'es'], 'nl');

  expect(mark(page, 'nl')).to.equal(null);
});

it('gives the mark its explanation as hover text and as its accessible name', async () => {
  const page = await mountPage(['es'], 'es');
  const fallback = mark(page, 'es')!;

  const explanation = fallback.getAttribute('aria-label');

  expect(explanation).to.be.a('string').and.not.equal('');
  expect(fallback.getAttribute('title')).to.equal(explanation);
});

it('ties the explanation to the choice, so a screen reader hears it there', async () => {
  const page = await mountPage(['es'], 'es');

  const describedBy = radio(page, 'es').getAttribute('aria-describedby');

  expect(describedBy).to.equal(mark(page, 'es')!.id);
});

it('reports a new choice', async () => {
  const page = await mountPage(['nl', 'es'], 'nl');
  let changed = false;
  page.addEventListener(UmbChangeEvent.TYPE, () => (changed = true));

  radio(page, 'es').click();

  expect(changed).to.equal(true);
  expect(page.value).to.equal('es');
});

it('keeps each hidden radio inside its row, so focusing one scrolls the list and not the wizard', async () => {
  // Found in a real backoffice: positioned against the screen, a radio far down the list sat outside
  // the list's scroll area, and choosing it scrolled the whole wizard off its head and buttons.
  const page = await mountPage(['nl', 'es'], 'nl');

  // Compared as a boolean: chai stalls printing a DOM element when the assertion fails.
  expect(radio(page, 'es').offsetParent === radio(page, 'es').closest('label')).to.equal(true);
});
