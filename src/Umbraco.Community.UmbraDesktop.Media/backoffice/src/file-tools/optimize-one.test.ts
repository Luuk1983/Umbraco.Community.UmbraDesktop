import { expect } from '@open-wc/testing';
import { UmbContextProvider, UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { optimizeOne } from './optimize-one.js';

/** The media service's context, by the alias it publishes. */
const MEDIA_SERVICE = new UmbContextToken<UmbContextMinimal>('UmbraDesktopMediaContext');

/** Optimize on one media item (#176): #139's window for this image, named after it. */
describe('optimizeOne', () => {
  it('opens a run for the item, named after it', () => {
    const asked: unknown[] = [];
    const desktop = document.createElement('div');
    document.body.appendChild(desktop);
    const provider = new UmbContextProvider(desktop, MEDIA_SERVICE, {
      optimizeMedia: (request: unknown) => (asked.push(request), new Promise(() => undefined)),
      getHostElement: () => desktop,
    } as never);
    provider.hostConnected();
    const element = document.createElement('div');
    desktop.appendChild(element);
    try {
      optimizeOne(element, { unique: 'k1', name: 'Banjo' });
      expect(asked).to.deep.equal([{ items: ['k1'], title: 'Banjo' }]);
    } finally {
      provider.destroy();
      desktop.remove();
    }
  });

  it('does nothing without the media service', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    expect(() => optimizeOne(element, { unique: 'k1', name: 'Banjo' })).not.to.throw();
    element.remove();
  });
});
