import { expect, fixture, html } from '@open-wc/testing';
import './migration-screen.element.js';
import { UMBRADESKTOP_MIGRATION_DISMISS_EVENT } from './migration-screen.element.js';
import type { UmbraDesktopMigrationScreenElement } from './migration-screen.element.js';
import type { UmbraDesktopMigrationPhase } from './types';
import { UMBRADESKTOP_Z_TASKBAR } from '../constants';

/**
 * The screen a migration runs behind.
 *
 * It exists because an OS that goes away and does something to your data without saying so is
 * unnerving, and because the alternative — a line flashed while the desktop paints — is a thing
 * nobody reads. So what is asserted here is shape rather than wording: it turns while it works, it
 * offers no way out mid-flight, and when it is finished it waits for the person instead of a timer.
 *
 * The wording lives in `migration-copy.ts` and is tested there, against the dictionary. Pinning
 * English in an element test would only punish somebody for improving a sentence.
 */

/**
 * Mount the screen in one phase.
 * @param phase Which state to render.
 * @returns The element and its shadow root.
 */
async function mountScreen(
  phase: UmbraDesktopMigrationPhase,
): Promise<{ element: UmbraDesktopMigrationScreenElement; root: ShadowRoot }> {
  const element = await fixture<UmbraDesktopMigrationScreenElement>(
    html`<umbradesktop-migration-screen
      .phase=${phase}
      .descriptionKey=${'umbraDesktop_migrationSettingsToAccount'}></umbradesktop-migration-screen>`,
  );

  return { element, root: element.shadowRoot! };
}

/**
 * Press the screen's only button, and wait for the press to actually land.
 *
 * `uui-button` overrides `click()` as an async method that awaits its own render before clicking the
 * native button inside its shadow root. A real pointer press needs no such help; a scripted one
 * lands a microtask later than it looks, which is long enough to assert against nothing.
 * @param root The screen's shadow root.
 * @returns A promise that resolves once the click has been delivered.
 */
async function clickDismiss(root: ShadowRoot): Promise<void> {
  const button = root.querySelector('uui-button') as (HTMLElement & { click(): Promise<void> }) | null;
  await button?.click();
}

it('turns the desktop loader while it works', async () => {
  // The same mark and arc the splash and the window bodies use, so "the desktop is busy" looks the
  // same wherever it happens rather than being a third invention.
  const { root } = await mountScreen('running');

  expect(root.querySelector('umbradesktop-loader')).to.not.be.null;
});

it('lights the loader for its own dark ground', async () => {
  // Found on a throttled connection, which is the only way to see the running state for long enough
  // to look at it: the loader reads --uui-color-text, which is near-black on a light backoffice, so
  // it painted a black mark on navy. Anything that pins the ground the loader sits on has to pin its
  // colour too — the loader's own comment says so, about themes.
  const { root } = await mountScreen('running');
  const loader = root.querySelector('umbradesktop-loader')!;

  const colour = getComputedStyle(loader).getPropertyValue('--umbradesktop-window-loader-color');

  expect(colour.trim()).to.not.equal('');
});

it('cannot be dismissed while it works', async () => {
  const { root } = await mountScreen('running');

  expect(root.querySelector('uui-button')).to.be.null;
});

it('stops turning the loader once it is finished', async () => {
  const { root } = await mountScreen('done');

  expect(root.querySelector('umbradesktop-loader')).to.be.null;
});

it('waits for the person when it is finished', async () => {
  const { root } = await mountScreen('done');

  expect(root.querySelector('uui-button')).to.not.be.null;
});

it('waits for the person when it failed', async () => {
  const { root } = await mountScreen('failed');

  expect(root.querySelector('uui-button')).to.not.be.null;
});

it('lets the person dismiss it when it is finished', async () => {
  const { element, root } = await mountScreen('done');
  let dismissed = 0;
  element.addEventListener(UMBRADESKTOP_MIGRATION_DISMISS_EVENT, () => dismissed++);

  await clickDismiss(root);

  expect(dismissed).to.equal(1);
});

it('lets the person dismiss it when it failed', async () => {
  const { element, root } = await mountScreen('failed');
  let dismissed = 0;
  element.addEventListener(UMBRADESKTOP_MIGRATION_DISMISS_EVENT, () => dismissed++);

  await clickDismiss(root);

  expect(dismissed).to.equal(1);
});

it('names the running migration as well as the state it is in', async () => {
  // Two different things: the state says "your settings are moving to your account", the migration
  // says which step is happening. With one migration they read as one message; with three they will
  // not, and the screen should not have to be rewritten then.
  const { root } = await mountScreen('running');

  expect(root.querySelector('.step')).to.not.be.null;
});

it('says nothing about a step once there is no step running', async () => {
  const { root } = await mountScreen('done');

  expect(root.querySelector('.step')).to.be.null;
});

it('announces the text that changes, without wrapping the control in a live region', async () => {
  // A live region around the button re-announces its label on every phase change. The region is the
  // status text; the dialog is the container.
  const { root } = await mountScreen('running');
  const live = root.querySelector('[role="status"]');

  expect(live).to.not.be.null;
  expect(live?.querySelector('uui-button')).to.be.null;
});

it('presents itself as a modal dialog rather than as an announcement', async () => {
  const { root } = await mountScreen('done');
  const dialog = root.querySelector('[role="alertdialog"]');

  expect(dialog).to.not.be.null;
  expect(dialog?.getAttribute('aria-modal')).to.equal('true');
  expect(dialog?.getAttribute('aria-labelledby')).to.equal('migration-title');
  expect(root.querySelector('#migration-title')).to.not.be.null;
});

it('does not take the document heading level for itself', async () => {
  // The backoffice already has an h1. A second one reorders the outline for anything reading by
  // heading, and the dialog is labelled by its title either way.
  const { root } = await mountScreen('running');

  expect(root.querySelector('h1')).to.be.null;
});

/*
 * Not tested here: that focus moves to the button when it appears.
 *
 * The element does it, in `updated()`, and it matters — covering is not blocking, and without it a
 * keyboard or screen reader user is left behind a cover they cannot see with no route to the only
 * control on screen. But asserting it wedges this runner. `uui-button.focus()` is async and awaits
 * its own render, and driving that from a test in headless Chrome never settles: the file stops
 * reporting entirely and fails on the 120s timeout rather than on an assertion.
 *
 * Verified by hand instead. Recorded here rather than deleted quietly, because the next person to
 * notice the gap deserves to know it was a deliberate retreat and not an oversight.
 */

it('sits above everything the desktop itself draws', async () => {
  // The bug this replaces: the screen was at 100 and the taskbar at 1,000,000, in the same stacking
  // context, so the taskbar and its settings dialog stayed clickable throughout a migration that was
  // rewriting those settings. Asserted against the shared constant rather than a literal, so the
  // relationship is what is pinned.
  const { element } = await mountScreen('running');

  expect(Number(getComputedStyle(element).zIndex)).to.be.greaterThan(UMBRADESKTOP_Z_TASKBAR);
});
