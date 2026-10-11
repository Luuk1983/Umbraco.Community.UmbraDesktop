import { expect } from '@open-wc/testing';
import './sign-in-page.element.js';
import type { UmbraDesktopWelcomeSignInPageElement } from './sign-in-page.element.js';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';

/**
 * The last page: one switch, with the label Desktop settings uses, off unless told otherwise
 * (design doc §3.4).
 */

/**
 * Mount the page by hand and wait for its first render.
 * @param checked Whether the switch starts on.
 * @returns The mounted page.
 */
async function mountPage(checked: boolean): Promise<UmbraDesktopWelcomeSignInPageElement> {
  const page = document.createElement('umbradesktop-welcome-sign-in') as UmbraDesktopWelcomeSignInPageElement;
  page.checked = checked;
  document.body.appendChild(page);
  await page.updateComplete;
  return page;
}

afterEach(() => {
  document.querySelectorAll('umbradesktop-welcome-sign-in').forEach((element) => element.remove());
});

it('uses the same label as Desktop settings', async () => {
  const page = await mountPage(false);

  const toggle = page.renderRoot.querySelector('uui-toggle')!;

  expect(toggle.getAttribute('label')).to.equal(page.localize.term('umbraDesktop_bootIntoDesktop'));
});

it('shows the switch as it was given', async () => {
  const off = await mountPage(false);
  const on = await mountPage(true);

  expect(off.renderRoot.querySelector('uui-toggle')!.checked).to.equal(false);
  expect(on.renderRoot.querySelector('uui-toggle')!.checked).to.equal(true);
});

it('reports the switch being turned on', async () => {
  const page = await mountPage(false);
  let changed = false;
  page.addEventListener(UmbChangeEvent.TYPE, () => (changed = true));
  const toggle = page.renderRoot.querySelector('uui-toggle')!;

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));

  expect(changed).to.equal(true);
  expect(page.checked).to.equal(true);
});
