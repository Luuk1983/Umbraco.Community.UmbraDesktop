import { expect, fixture, html } from '@open-wc/testing';
import './health-start.element.js';
import type { UmbraDesktopHealthStartElement } from './health-start.element.js';
import type { UmbraDesktopHealthRingElement } from './health-ring.element.js';
import type { UmbraDesktopMediaHealthPhase } from './media-health.context.js';
import { KEY_NAMES, textOf, tick } from './health.test-helper.js';

/** No check yet and Checking (design §16.3, mock scenes 0 and 3). */

/**
 * The screen at a phase.
 * @param phase Where the check is.
 * @param mediaCount The library's items.
 */
async function start(phase: UmbraDesktopMediaHealthPhase, mediaCount?: number) {
  const element = await fixture<UmbraDesktopHealthStartElement>(html`<umbradesktop-health-start .phase=${phase} .mediaCount=${mediaCount}></umbradesktop-health-start>`);
  const ring = () => element.shadowRoot!.querySelector<UmbraDesktopHealthRingElement>('umbradesktop-health-ring')!;
  const steps = () => [...element.shadowRoot!.querySelectorAll('.step')].map((each) => each.getAttribute('data-state'));
  return { element, ring, steps, text: () => textOf(element) };
}

describe('No check yet', () => {
  it('invites a check, with the library count in the backoffice culture, and asks for one on the button', async () => {
    const { element, ring, text } = await start({ kind: 'idle' }, 18240);
    expect(ring().empty).to.equal(true);
    expect(text()).to.contain('How healthy is your media library?');
    expect(text()).to.contain(`${(18240).toLocaleString(element.localize.lang() || undefined)} items`);
    const asked: string[] = [];
    element.addEventListener('health-check', () => asked.push('check'));
    element.shadowRoot!.querySelector<HTMLElement>('uui-button[label="Check my media library"]')!.click();
    await tick();
    expect(asked).to.deep.equal(['check']);
  });

  it('names the three checks', async () => {
    const { text } = await start({ kind: 'idle' }, 3);
    expect(text()).to.contain('Unused items');
    expect(text()).to.contain('Orphaned files');
    expect(text()).to.contain('Oversized images');
    expect(text()).to.contain('Images over 2 MB');
  });

  it('says why a check failed', async () => {
    const { text } = await start({ kind: 'failed', message: 'Boom' }, 3);
    expect(text()).to.contain('The check did not finish: Boom');
  });
});

describe('Stopping a check', () => {
  it('offers Stop while a check runs, and asks for it', async () => {
    const { element } = await start({ kind: 'running', step: 'usage', scanned: 1, total: 3 }, 3);
    const asked: string[] = [];
    element.addEventListener('health-stop', () => asked.push('stop'));
    element.shadowRoot!.querySelector<HTMLElement>('uui-button[label="Stop"]')!.click();
    await tick();
    expect(asked).to.deep.equal(['stop']);
  });

  it('offers no Stop before a check runs', async () => {
    const { element } = await start({ kind: 'idle' }, 3);
    expect(element.shadowRoot!.querySelector('uui-button[label="Stop"]')).to.equal(null);
  });
});

describe('Checking', () => {
  it('fills the ring with the real count while the items are read, the first step going', async () => {
    const { element, ring, steps, text } = await start({ kind: 'running', step: 'usage', scanned: 412, total: 1284 });
    const number = (value: number) => value.toLocaleString(element.localize.lang() || undefined);
    expect(ring().fraction).to.be.closeTo(412 / 1284, 0.0001);
    expect(steps()).to.deep.equal(['going', 'waiting', 'waiting']);
    expect(text()).to.contain(`412 of ${number(1284)}`);
  });

  it('ticks the first two steps on the disk walk, whose count is not known, and turns the ring', async () => {
    const { ring, steps } = await start({ kind: 'running', step: 'disk', scanned: 0, total: 0 });
    expect(steps()).to.deep.equal(['done', 'done', 'going']);
    expect(ring().fraction).to.equal(undefined);
  });

  it('shows the ring turning, not 0%, before the server has counted', async () => {
    const { ring, text } = await start({ kind: 'running', step: 'usage', scanned: 0, total: 0 });
    expect(ring().fraction).to.equal(undefined);
    expect(text()).to.not.contain('0%');
  });

  it('names no key anywhere', async () => {
    expect((await start({ kind: 'idle' }, 3)).text()).to.not.match(KEY_NAMES);
    expect((await start({ kind: 'running', step: 'usage', scanned: 1, total: 2 })).text()).to.not.match(KEY_NAMES);
  });
});
