import { expect } from '@open-wc/testing';
import { resolveThemeSync, syncThemeStylesheet } from './iframe-theme.js';

/** Stands in for the registered `theme` extensions, in the shape this module reads them. */
const THEMES = [
  { alias: 'umb-light-theme' },
  { alias: 'umb-dark-theme', css: '/umbraco/backoffice/css/dark.css' },
  { alias: 'umb-high-contrast-theme', css: '/umbraco/backoffice/css/high-contrast.css' },
];

/** A bare document standing in for a window's iframe, optionally already carrying a theme. */
function doc(href?: string): Document {
  const created = document.implementation.createHTMLDocument('frame');
  if (href) {
    const link = created.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    created.head.appendChild(link);
  }
  return created;
}

/** The theme stylesheets present in a document, in order. */
function hrefs(target: Document): string[] {
  return [...target.head.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href') ?? '');
}

it('reports every known theme stylesheet, so stale ones can be recognised', () => {
  expect(resolveThemeSync(THEMES, 'umb-dark-theme').known).to.eql([
    '/umbraco/backoffice/css/dark.css',
    '/umbraco/backoffice/css/high-contrast.css',
  ]);
});

it('resolves the active theme to the stylesheet it paints with', () => {
  expect(resolveThemeSync(THEMES, 'umb-dark-theme').active).to.equal('/umbraco/backoffice/css/dark.css');
});

it('resolves the light theme to no stylesheet at all, because it is the base', () => {
  expect(resolveThemeSync(THEMES, 'umb-light-theme').active).to.equal(undefined);
});

it('adds the theme stylesheet when switching away from light', () => {
  const frame = doc();
  syncThemeStylesheet(frame, resolveThemeSync(THEMES, 'umb-dark-theme'));
  expect(hrefs(frame)).to.eql(['/umbraco/backoffice/css/dark.css']);
});

it('removes the theme stylesheet when switching back to light', () => {
  const frame = doc('/umbraco/backoffice/css/dark.css');
  syncThemeStylesheet(frame, resolveThemeSync(THEMES, 'umb-light-theme'));
  expect(hrefs(frame)).to.eql([]);
});

it('replaces one theme stylesheet with another', () => {
  const frame = doc('/umbraco/backoffice/css/dark.css');
  syncThemeStylesheet(frame, resolveThemeSync(THEMES, 'umb-high-contrast-theme'));
  expect(hrefs(frame)).to.eql(['/umbraco/backoffice/css/high-contrast.css']);
});

it('leaves an already-correct stylesheet element untouched', () => {
  // Identity matters: removing and re-adding the same link re-fetches it and flashes the frame
  // unstyled, and this runs on every theme emission, not only on an actual change.
  const frame = doc('/umbraco/backoffice/css/dark.css');
  const before = frame.head.querySelector('link');
  syncThemeStylesheet(frame, resolveThemeSync(THEMES, 'umb-dark-theme'));
  expect(frame.head.querySelector('link')).to.equal(before);
});

it('leaves stylesheets that are not themes alone', () => {
  const frame = doc('/css/something-else.css');
  syncThemeStylesheet(frame, resolveThemeSync(THEMES, 'umb-dark-theme'));
  expect(hrefs(frame)).to.eql(['/css/something-else.css', '/umbraco/backoffice/css/dark.css']);
});

it('reports a JS-loaded theme as un-mirrorable rather than silently dropping it', () => {
  // A theme may supply its CSS as a loader function instead of a URL. There is no link to copy in
  // that case, and treating it as "no stylesheet" would leave the frame on the base light theme.
  const themes = [{ alias: 'custom', css: async () => ({ default: 'body{}' }) }];
  const sync = resolveThemeSync(themes, 'custom');
  expect(sync.mirrorable, 'a loader-function theme cannot be mirrored as a link').to.equal(false);
  expect(resolveThemeSync(THEMES, 'umb-dark-theme').mirrorable).to.equal(true);
});
