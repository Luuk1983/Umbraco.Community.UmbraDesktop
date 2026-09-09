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
