import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_MEDIA_CLEANUP_SHOW_EVENT, parseHealthLocation, printHealthLocation, showInMediaCleanup } from './health-location.js';

const KEY = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

describe('a Media Cleanup location', () => {
  it('round-trips a folder and the library', () => {
    expect(parseHealthLocation(printHealthLocation(KEY))).to.deep.equal({ folderKey: KEY });
    expect(parseHealthLocation(printHealthLocation(null))).to.deep.equal({ folderKey: null });
  });

  it('reads nothing, or anything that is not a key, as no list at all', () => {
    expect(parseHealthLocation(undefined)).to.equal(undefined);
    expect(parseHealthLocation('')).to.equal(undefined);
    expect(parseHealthLocation('folder=<script>')).to.equal(undefined);
  });

  it('tells an open Media Cleanup window, in the same page, which folder to show', () => {
    const heard: unknown[] = [];
    const listen = (event: Event) => heard.push((event as CustomEvent).detail);
    document.addEventListener(UMBRADESKTOP_MEDIA_CLEANUP_SHOW_EVENT, listen);
    try {
      showInMediaCleanup(KEY);
      expect(heard).to.deep.equal([{ location: printHealthLocation(KEY) }]);
    } finally {
      document.removeEventListener(UMBRADESKTOP_MEDIA_CLEANUP_SHOW_EVENT, listen);
    }
  });
});
