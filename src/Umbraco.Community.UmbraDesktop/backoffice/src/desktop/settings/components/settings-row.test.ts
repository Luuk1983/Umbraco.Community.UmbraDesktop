import { expect } from '@open-wc/testing';
import './settings-row.element.js';
import type { UmbraDesktopSettingsRowElement } from './settings-row.element.js';

/**
 * The row is a flex line of three things — a picture, some text, a chevron — and the text is the
 * only one of them that should ever change size. Whether that holds is geometry, so it is measured
 * rather than reasoned about.
 */

let host: HTMLElement;

/**
 * Mount a row in a container narrow enough to make its detail wrap.
 *
 * By hand rather than with `fixture()`: the row renders `uui-icon`, which is not registered in a
 * bare test page, so `fixture()` waits on a tree that never settles.
 * @param detail The line under the headline.
 * @returns The mounted row.
 */
async function rowWith(detail: string) {
  host = document.createElement('div');
  host.style.width = '300px';
  document.body.append(host);
  const row = document.createElement('umbradesktop-settings-row') as UmbraDesktopSettingsRowElement;
  row.headline = 'Light';
  row.detail = detail;
  const lead = document.createElement('span');
  lead.slot = 'lead';
  lead.style.cssText = 'display:block;width:96px;height:60px;';
  row.append(lead);
  host.append(row);
  await row.updateComplete;
  return row;
}

afterEach(() => host?.remove());

it('keeps the chevron the same size however much the text wraps', async () => {
  // Three lines of detail squeezed the chevron to about half the size it has beside a one-line
  // row, which reads as two different controls on one screen. A flex item shrinks by default, and
  // the chevron is the one item here with nothing to give.
  const row = await rowWith(
    "Umbraco's own light, dark and high contrast. Applies to the whole backoffice, including what is inside every window.",
  );
  const chevron = row.shadowRoot!.querySelector('.chevron') as HTMLElement;

  // Measured as a style rather than as a width: `uui-icon` is not registered in a bare test page,
  // so it lays out as an empty inline element and every width here would be zero. `flex-shrink` is
  // the property that was wrong and it is readable whether or not the icon ever paints.
  expect(getComputedStyle(chevron).flexShrink).to.equal('0');
});

it('leaves the lead slot at the size its caller gave it', async () => {
  // The row sizes nothing in the lead slot — a 144px preview and a 24px icon both sit in it — so
  // the squeeze that hit the chevron must not reach a caller's picture either.
  const row = await rowWith('Built-in image');
  const lead = row.querySelector('[slot="lead"]') as HTMLElement;

  expect(lead.getBoundingClientRect().width).to.equal(96);
});
