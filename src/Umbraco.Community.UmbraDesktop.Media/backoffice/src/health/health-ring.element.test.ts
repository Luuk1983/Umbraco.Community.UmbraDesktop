import { expect, fixture, html } from '@open-wc/testing';
import './health-ring.element.js';
import { RING_SIZE, RING_STROKE } from './health-ring.element.js';
import type { UmbraDesktopHealthRingElement } from './health-ring.element.js';

/**
 * The ring of No check yet and Checking (design §16.3): dashed and empty before a check, filled by
 * the real progress during one, and turning when the progress is not known.
 */

describe('the Media Health ring', () => {
  it('draws at its own size, from one constant the SVG and the CSS both read', async () => {
    const ring = await fixture<UmbraDesktopHealthRingElement>(html`<umbradesktop-health-ring .fraction=${0}></umbradesktop-health-ring>`);
    const svg = ring.shadowRoot!.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).to.equal(`0 0 ${RING_SIZE} ${RING_SIZE}`);
    expect(ring.getBoundingClientRect().width).to.equal(RING_SIZE);
    expect(Number(svg.querySelector('.fill')!.getAttribute('stroke-width'))).to.equal(RING_STROKE);
  });

  it('fills by the fraction given', async () => {
    const ring = await fixture<UmbraDesktopHealthRingElement>(html`<umbradesktop-health-ring .fraction=${0.32}></umbradesktop-health-ring>`);
    const fill = ring.shadowRoot!.querySelector('.fill')!;
    const circumference = 2 * Math.PI * ((RING_SIZE - RING_STROKE) / 2);
    expect(Number(fill.getAttribute('stroke-dasharray'))).to.be.closeTo(circumference, 0.01);
    expect(Number(fill.getAttribute('stroke-dashoffset'))).to.be.closeTo(circumference * 0.68, 0.01);
    expect(ring.hasAttribute('indeterminate')).to.equal(false);
  });

  it('is dashed and empty before any check', async () => {
    const ring = await fixture<UmbraDesktopHealthRingElement>(html`<umbradesktop-health-ring empty></umbradesktop-health-ring>`);
    expect(ring.shadowRoot!.querySelector('.fill')).to.equal(null);
    expect(ring.shadowRoot!.querySelector('.track')!.getAttribute('stroke-dasharray')).to.not.equal(null);
  });

  it('turns rather than showing 0% when the progress is not known', async () => {
    const ring = await fixture<UmbraDesktopHealthRingElement>(html`<umbradesktop-health-ring></umbradesktop-health-ring>`);
    expect(ring.hasAttribute('indeterminate')).to.equal(true);
  });
});
