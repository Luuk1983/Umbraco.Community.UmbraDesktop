import { expect, fixture, html } from '@open-wc/testing';
import './health-cleanup-sheet.element.js';
import type { UmbraDesktopHealthCleanupSheetElement } from './health-cleanup-sheet.element.js';
import { cleanupOf } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, result, textOf, tick } from './health.test-helper.js';

/** Clean up asks once (design §16.3, mock scene 4): per kind what happens, its count and size. */

/**
 * The sheet for some ticked rows.
 * @param kinds The rows ticked.
 * @param admin Whether the person is an administrator.
 */
async function sheet(kinds: HealthKind[], admin = true) {
  const cleanup = cleanupOf(result().lists, new Set(kinds), admin);
  const element = await fixture<UmbraDesktopHealthCleanupSheetElement>(html`<umbradesktop-health-cleanup-sheet .cleanup=${cleanup} .admin=${admin}></umbradesktop-health-cleanup-sheet>`);
  const events: string[] = [];
  element.addEventListener('health-cleanup-confirm', () => events.push('confirm'));
  element.addEventListener('health-cleanup-cancel', () => events.push('cancel'));
  const press = async (label: string) => {
    element.shadowRoot!.querySelector<HTMLElement>(`uui-button[label="${label}"]`)!.click();
    await tick();
  };
  return { element, cleanup, events, press, text: () => textOf(element) };
}

describe('the Clean up sheet', () => {
  it('lists only the ticked rows, each saying what happens to it', async () => {
    const { element, text, cleanup } = await sheet(['unused', 'oversized']);
    expect(element.shadowRoot!.querySelectorAll('.line').length).to.equal(2);
    expect(text()).to.contain('2 unused items go to the recycle bin');
    expect(text()).to.contain('1 images open in Optimize images');
    expect(text()).to.not.contain('deleted for good');
    expect(text()).to.contain(`Clean up about ${formatBytes(cleanup.bytes)}?`);
  });

  it('says at least for unused items when some have no size, never a plain 0 B', async () => {
    const { element } = await sheet(['unused']);
    expect(textOf(element.shadowRoot!.querySelector('[data-kind=unused] b')!).trim()).to.equal(`at least ${formatBytes(500)}`);
    expect(textOf(element.shadowRoot!.querySelector('[data-kind=unused] .amount small')!).trim()).to.equal('1 of unknown size');
  });

  it('tells someone who is not an administrator why orphaned files stay', async () => {
    const { text } = await sheet(['unused', 'orphaned'], false);
    expect(text()).to.contain('Only an administrator can delete files, so orphaned files stay on disk.');
    expect(text()).to.not.contain('deleted for good');
  });

  it('confirms with Clean up, and Cancel starts nothing', async () => {
    const { events, press } = await sheet(['unused', 'orphaned']);
    await press('Cancel');
    expect(events).to.deep.equal(['cancel']);
    await press('Clean up');
    expect(events).to.deep.equal(['cancel', 'confirm']);
  });

  it('names no key', async () => {
    expect((await sheet(['unused', 'orphaned', 'oversized'])).text()).to.not.match(KEY_NAMES);
  });
});
