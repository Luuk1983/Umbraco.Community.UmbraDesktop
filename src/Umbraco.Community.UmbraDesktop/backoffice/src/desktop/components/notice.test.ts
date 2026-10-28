import { expect } from '@open-wc/testing';
import './notice.element.js';
import type { UmbraDesktopNoticeElement } from './notice.element.js';
import { UMBRADESKTOP_NOTICE_ACTION_EVENT } from '../constants.js';

/**
 * The notice banner as a component of its own: the window's notice stack draws it, and an app draws
 * it inside its own content, so a warning looks the same wherever the desktop shows one.
 */

/**
 * Mount a notice and wait for it to draw.
 * @param set What to set on it.
 * @returns The mounted element.
 */
async function mount(set: Partial<UmbraDesktopNoticeElement>) {
  const element = document.createElement('umbradesktop-notice') as UmbraDesktopNoticeElement;
  Object.assign(element, set);
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

/**
 * The banner inside the element.
 * @param element The mounted element.
 * @returns The `.notice` box.
 */
const box = (element: UmbraDesktopNoticeElement) => element.renderRoot.querySelector('.notice') as HTMLElement;

it('draws a heading, a sentence and the severity as an icon', async () => {
  const element = await mount({ severity: 'warning', heading: 'This check is old', body: 'Check again first.' });
  expect(box(element).getAttribute('data-severity')).to.equal('warning');
  expect(element.renderRoot.querySelector('.notice-title')?.textContent?.trim()).to.equal('This check is old');
  expect(element.renderRoot.querySelector('.notice-body')?.textContent?.trim()).to.equal('Check again first.');
  const icon = element.renderRoot.querySelector('.notice-icon');
  expect(icon?.getAttribute('name')).to.equal('icon-alert');
  expect(icon?.getAttribute('aria-hidden')).to.equal('true');
  element.remove();
});

it('is an alert for an error and a status for a warning', async () => {
  const error = await mount({ severity: 'error', heading: 'Gone' });
  expect(box(error).getAttribute('role')).to.equal('alert');
  expect(error.renderRoot.querySelector('.notice-icon')?.getAttribute('name')).to.equal('icon-wrong');
  error.remove();
  const warning = await mount({ severity: 'warning', heading: 'Old' });
  expect(box(warning).getAttribute('role')).to.equal('status');
  warning.remove();
});

it('draws no body line when there is no sentence', async () => {
  const element = await mount({ severity: 'warning', heading: 'Old' });
  expect(element.renderRoot.querySelector('.notice-body')).to.equal(null);
  element.remove();
});

it('draws its actions as real buttons, and says which was pressed', async () => {
  const element = await mount({ severity: 'warning', heading: 'Old', actions: [{ id: 'again', label: 'Check again' }] });
  const pressed: string[] = [];
  element.addEventListener(UMBRADESKTOP_NOTICE_ACTION_EVENT, (event) => pressed.push((event as CustomEvent<{ action: string }>).detail.action));
  const button = element.renderRoot.querySelector<HTMLElement>('.notice-actions uui-button')!;
  expect(button.getAttribute('label')).to.equal('Check again');
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(pressed).to.deep.equal(['again']);
  element.remove();
});

it('names every class so a theme cannot hit one by accident', async () => {
  // It adopts the theme's whole window sheet, as the stack it came from does, so a frame selector
  // such as macOS's '.title' would otherwise land on it.
  const element = await mount({ severity: 'warning', heading: 'Old', body: 'Again.', actions: [{ id: 'a', label: 'A' }] });
  const classes = [...element.renderRoot.querySelectorAll('[class]')].flatMap((node) => [...node.classList]);
  expect(classes.length).to.be.greaterThan(0);
  for (const name of classes) expect(name.startsWith('notice'), `'.${name}' is not namespaced`).to.equal(true);
  element.remove();
});

it('carries the notice name for a stack or a test to key on', async () => {
  const element = await mount({ severity: 'warning', heading: 'Old', name: 'stale' });
  expect(box(element).getAttribute('data-notice')).to.equal('stale');
  element.remove();
});
