import { expect } from '@open-wc/testing';
import './desktop.element.js';
import type { UmbraDesktopDesktopElement } from './desktop.element.js';
import { UMBRADESKTOP_SECTION_ALIAS } from '../constants';
import { sectionTabSelector } from '../../headerapps/section-tab-hide';

/**
 * The desktop hides the whole backoffice header while it is open, so the Desktop section tab is
 * invisible for as long as you stay on the desktop. If the boot-time hide never landed — the
 * bounded poll in `hideSectionTab` timed out on a slow load, or the shell mounted after it gave
 * up — the very first moment you would notice is when the desktop unmounts and the header comes
 * back. The desktop therefore re-asserts the hide on the way out.
 */

/** Mount a stand-in backoffice shell: a shadow root owning the header and the section tab list. */
function mountShell() {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.appendChild(document.createElement('umb-backoffice-header'));
  const group = document.createElement('uui-tab-group');
  const tab = document.createElement('uui-tab');
  tab.setAttribute('data-mark', `section-link:${UMBRADESKTOP_SECTION_ALIAS}`);
  tab.setAttribute('label', 'Desktop');
  group.appendChild(tab);
  root.appendChild(group);
  document.body.appendChild(host);
  return { host, root };
}

it('re-asserts the section-tab hide when the desktop unmounts', async () => {
  const shell = mountShell();
  try {
    // Mounted by hand rather than via `fixture`, whose `nextFrame()` never resolves in the
    // backgrounded pages the test runner uses when it has several files in flight.
    const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
    document.body.appendChild(desktop);
    await desktop.updateComplete;

    expect(
      shell.root.querySelector('style#umbradesktop-hide-section-tab'),
      'the tab hide should not be present before the desktop exits',
    ).to.equal(null);

    desktop.remove();

    const style = shell.root.querySelector('style#umbradesktop-hide-section-tab');
    expect(style, 'the desktop should re-assert the tab hide on unmount').to.not.equal(null);
    expect(style!.textContent).to.contain(sectionTabSelector(UMBRADESKTOP_SECTION_ALIAS));
  } finally {
    shell.host.remove();
  }
});
