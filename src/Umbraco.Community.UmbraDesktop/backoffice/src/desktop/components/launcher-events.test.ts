import { expect, fixture, html } from '@open-wc/testing';
import './launcher.element.js';
import type { UmbraDesktopLauncherElement } from './launcher.element.js';

/**
 * The launcher is mounted only while the start menu is open, and the taskbar removes it from the
 * DOM the moment a pointer goes down outside it — including a pointer inside a modal the launcher
 * itself opened. Umbraco proxies a modal's context requests through the element that opened it,
 * so a modal owned by the launcher loses its context origin as soon as you click inside it, and
 * every later `getContext` hangs forever with no error.
 *
 * The launcher must therefore never open a modal itself. It reports the intent and the taskbar —
 * which lives as long as the desktop — owns the modal.
 */

/**
 * Mount a launcher and click one of its buttons.
 * @param selector CSS selector for the button, resolved inside the launcher's shadow root.
 * @returns The event names the launcher dispatched.
 */
async function clickAndCapture(selector: string): Promise<string[]> {
  const element = await fixture<UmbraDesktopLauncherElement>(html`<umbradesktop-launcher></umbradesktop-launcher>`);
  const seen: string[] = [];
  for (const name of ['search', 'profile', 'settings', 'launched', 'exit']) {
    element.addEventListener(name, () => seen.push(name));
  }

  const button = element.shadowRoot?.querySelector<HTMLElement>(selector);
  expect(button, `no element matched ${selector}`).to.not.equal(null);
  button!.click();
  await element.updateComplete;
  return seen;
}

it('asks its host to open search rather than opening the modal itself', async () => {
  expect(await clickAndCapture('.search')).to.deep.equal(['search']);
});

it('asks its host to open the user profile rather than opening the modal itself', async () => {
  expect(await clickAndCapture('.user')).to.deep.equal(['profile']);
});

it('asks its host to open desktop settings rather than opening the modal itself', async () => {
  // The footer actions are, in order: settings, log out, exit.
  expect(await clickAndCapture('.actions .fbtn')).to.deep.equal(['settings']);
});
