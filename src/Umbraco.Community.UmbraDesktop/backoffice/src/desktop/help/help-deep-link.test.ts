import { expect } from '@open-wc/testing';
import { helpDeepLinkTarget, withoutHelpParam } from './help-deep-link.js';

describe('helpDeepLinkTarget', () => {
  it('reads the help parameter from a query string', () => {
    expect(helpDeepLinkTarget('?help=umbradesktop/snapping/on-a-narrow-screen')).to.equal('umbradesktop/snapping/on-a-narrow-screen');
    expect(helpDeepLinkTarget('?desktop=on&help=umbradesktop')).to.equal('umbradesktop');
  });

  it('reads an encoded one, as a mail client may write it', () => {
    expect(helpDeepLinkTarget('?help=umbradesktop%2Fsnapping')).to.equal('umbradesktop/snapping');
  });

  it('is nothing without one, or with an empty one', () => {
    expect(helpDeepLinkTarget('')).to.equal(undefined);
    expect(helpDeepLinkTarget('?desktop=off')).to.equal(undefined);
    expect(helpDeepLinkTarget('?help=')).to.equal(undefined);
  });
});

describe('withoutHelpParam', () => {
  it('drops the help parameter and keeps the rest of the address', () => {
    expect(withoutHelpParam('https://x.test/umbraco/section/umbradesktop?help=a/b&x=1#top')).to.equal(
      'https://x.test/umbraco/section/umbradesktop?x=1#top',
    );
    expect(withoutHelpParam('https://x.test/umbraco/section/umbradesktop?help=a')).to.equal('https://x.test/umbraco/section/umbradesktop');
  });

  it('is nothing when there is no help parameter to drop', () => {
    expect(withoutHelpParam('https://x.test/umbraco/section/umbradesktop?x=1')).to.equal(undefined);
  });
});
