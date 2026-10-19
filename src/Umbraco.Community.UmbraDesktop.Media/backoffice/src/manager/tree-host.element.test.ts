import { expect, fixture, html } from '@open-wc/testing';
import './tree-host.element.js';
import type { UmbraDesktopMediaTreeHostElement } from './tree-host.element.js';
import { UMBRADESKTOP_MEDIA_BIN_TREE, UMBRADESKTOP_MEDIA_FOLDER_TREE } from '../tree/constants.js';

/**
 * Make one of the host's trees as tall as a long one, whether or not core's tree element is defined
 * in the test.
 * @param tree The tree element.
 * @param height Its content's height.
 */
function fill(tree: Element, height: number) {
  const content = document.createElement('div');
  content.style.cssText = `display:block;height:${height}px`;
  (tree.shadowRoot ?? tree).appendChild(content);
}

/**
 * The tree host in a window of a given height.
 * @param height The window's height.
 * @returns The host and its two trees.
 */
async function hosted(height: number) {
  const host = await fixture<UmbraDesktopMediaTreeHostElement>(
    html`<div style="display:flex;flex-direction:column;height:${height}px;width:220px">
      <umbradesktop-media-tree-host style="flex:1"></umbradesktop-media-tree-host>
    </div>`,
  ).then((wrapper) => wrapper.querySelector('umbradesktop-media-tree-host')!);
  const media = host.shadowRoot!.querySelector('.media')!;
  const bin = host.shadowRoot!.querySelector('.bin')!;
  return { host, media, bin };
}

describe('the tree beside a manager window', () => {
  it('keeps the recycle bin at its foot however long the media tree is, and scrolls the tree alone', async () => {
    const { host, media, bin } = await hosted(400);
    fill(media, 2000);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const frame = host.getBoundingClientRect();
    expect(bin.getBoundingClientRect().bottom).to.be.at.most(frame.bottom + 1);
    expect(media.scrollHeight).to.be.greaterThan(media.clientHeight);
  });

  it('draws the folders-only tree and the one-row recycle bin', async () => {
    const { media, bin } = await hosted(400);
    expect([media.getAttribute('alias'), bin.getAttribute('alias')]).to.deep.equal([UMBRADESKTOP_MEDIA_FOLDER_TREE, UMBRADESKTOP_MEDIA_BIN_TREE]);
  });
});
