import { expect } from '@open-wc/testing';
import { ARCADE_DISPLAY_FONT, ensureArcadeFont } from './font.js';

it('declares the display font once, in the document, where a shadow root can use it', () => {
  const doc = document.implementation.createHTMLDocument('font');
  ensureArcadeFont(doc);
  ensureArcadeFont(doc);
  const styles = doc.head.querySelectorAll('style#umbradesktop-arcade-font');
  expect(styles).to.have.length(1);
  expect(styles[0].textContent).to.contain(ARCADE_DISPLAY_FONT).and.contain('.woff2');
});
