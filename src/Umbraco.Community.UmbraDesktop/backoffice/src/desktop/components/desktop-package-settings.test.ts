import { expect } from '@open-wc/testing';
import './desktop.element.js';
import type { UmbraDesktopDesktopElement } from './desktop.element.js';
import { UmbraDesktopPackageSettingsContext } from '../settings/package-settings.context.js';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The desktop registers itself with the package settings context, so a package's `openSettings`
 * opens on the desktop on screen (design §5). The case worth a test is a move in the DOM: Umbraco's
 * consumer does not call back for a context it still holds, so a desktop that only attached in that
 * callback would drop off on the disconnect half of the move and never come back.
 */

/** A package settings context that records where settings would open instead of opening them. */
class ProbeContext extends UmbraDesktopPackageSettingsContext {
  /** The desktop each request went to, in order. */
  public opened: UmbControllerHost[] = [];

  /**
   * Record the request instead of opening a modal, which needs a backoffice.
   * @param host The desktop it would open on.
   */
  protected override _open(host: UmbControllerHost): void {
    this.opened.push(host);
  }
}

/**
 * The newest entry, since the project's ES2020 lib has no `Array.prototype.at`.
 * @param list The list.
 * @returns Its last entry, or undefined when empty.
 */
function last<T>(list: T[]): T | undefined {
  return list[list.length - 1];
}

/**
 * Let the consumer's disconnect microtask run, which is when a desktop that left for good is told.
 * @returns When it has.
 */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

it('opens settings on the desktop, after a move as well, and not once it has gone', async () => {
  const wrapper = document.createElement('div');
  const inner = document.createElement('div');
  wrapper.appendChild(inner);
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const context = new ProbeContext(host);
  host.hostConnected();
  try {
    // Mounted by hand rather than via `fixture`, whose `nextFrame()` never resolves in the
    // backgrounded pages the test runner uses when it has several files in flight.
    const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
    wrapper.appendChild(desktop);
    await desktop.updateComplete;
    expect(context.openSettings('My Package')).to.equal(true);
    expect(last(context.opened) === desktop).to.equal(true);

    inner.appendChild(desktop);
    await settle();
    expect(context.openSettings('My Package'), 'still attached after a move').to.equal(true);
    expect(last(context.opened) === desktop).to.equal(true);

    desktop.remove();
    await settle();
    expect(context.openSettings('My Package'), 'detached once removed').to.equal(false);
  } finally {
    wrapper.remove();
    host.destroy();
  }
});
