import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_SPLASH_ELEMENT_ID, isBootSplashRaised, lowerBootSplash, raiseBootSplash } from './splash';

afterEach(() => lowerBootSplash());

it('raises a splash attached to the body, not into a shadow root', () => {
  // Attached to the body so that the backoffice element mounting, a section route changing or the
  // desktop element connecting cannot orphan it.
  raiseBootSplash();
  const element = document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID);
  expect(element).to.exist;
  expect(element?.parentElement).to.equal(document.body);
  expect(isBootSplashRaised()).to.equal(true);
});

it('is idempotent: raising twice leaves one splash', () => {
  raiseBootSplash();
  raiseBootSplash();
  expect(document.querySelectorAll(`#${UMBRADESKTOP_SPLASH_ELEMENT_ID}`).length).to.equal(1);
});

it('lowers the splash, and lowering when none is raised is harmless', () => {
  raiseBootSplash();
  lowerBootSplash();
  expect(isBootSplashRaised()).to.equal(false);
  expect(() => lowerBootSplash()).to.not.throw();
});

it('hides itself from assistive technology rather than hiding the app from it', () => {
  raiseBootSplash();
  expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID)?.getAttribute('aria-hidden')).to.equal('true');
});

it('covers the viewport from the top of the stacking order', () => {
  raiseBootSplash();
  const style = getComputedStyle(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) as HTMLElement);
  expect(style.position).to.equal('fixed');
  expect(Number(style.zIndex)).to.be.greaterThan(1000);
});

it('carries its own mark, so it needs neither the icon registry nor the network', () => {
  raiseBootSplash();
  expect(document.querySelector(`#${UMBRADESKTOP_SPLASH_ELEMENT_ID} svg`)).to.exist;
  expect(document.querySelector(`#${UMBRADESKTOP_SPLASH_ELEMENT_ID} img`)).to.equal(null);
});

it('shows its progress as a ring around the mark', () => {
  raiseBootSplash();
  const splash = document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) as HTMLElement;
  expect(splash.querySelector('.ring .track'), 'the ring needs a track to run in').to.exist;
  expect(splash.querySelector('.ring .arc'), 'the ring needs a moving arc').to.exist;
});

it('leaves a whole ring rather than a frozen arc under reduced motion', () => {
  // Asserted against the stylesheet text, the way the theme tests assert their own rules: the
  // media query cannot be exercised here, and the failure it guards is silent. A stopped arc would
  // sit there as a fragment of a circle, reading as progress that has stalled — so the arc goes and
  // the full track stays, which reads as an ornament around the mark.
  raiseBootSplash();
  const css = (document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) as HTMLElement).innerHTML;
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
  expect(css).to.contain('prefers-reduced-motion');
  expect(reduced).to.match(/\.arc\s*\{[^}]*display:\s*none/);
});

it('boots under the name UmbracOS', () => {
  // Not the package name, on purpose: this is the one surface that reads as an operating system
  // starting up, so it is the one place the joke lands. Pinned in a test because it looks like a
  // typo for UmbraDesktop and would otherwise get helpfully corrected.
  raiseBootSplash();
  const splash = document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID);
  expect(splash?.textContent).to.contain('UmbracOS');
});

it('asks for no font it might have to wait for', () => {
  // A webfont that arrives late reflows the wordmark mid-boot, and the splash paints before
  // anything can guarantee one is loaded. System stack only.
  raiseBootSplash();
  const splash = document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) as HTMLElement;
  expect(splash.innerHTML).to.not.match(/@font-face|fonts\.googleapis|\.woff/);
  expect(getComputedStyle(splash.querySelector('.wordmark') as HTMLElement).fontFamily).to.contain('system-ui');
});

it('lifts itself when readiness never arrives', async () => {
  // The only thing between a signal that never comes and an opaque overlay over a working
  // backoffice, since the splash has no CSS-only expiry.
  raiseBootSplash(document, 20);
  expect(isBootSplashRaised()).to.equal(true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(isBootSplashRaised()).to.equal(false);
});

it('does not let a spent timeout lift a splash raised after it', async () => {
  raiseBootSplash(document, 20);
  lowerBootSplash();
  raiseBootSplash(document, 5000);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(isBootSplashRaised()).to.equal(true);
});
