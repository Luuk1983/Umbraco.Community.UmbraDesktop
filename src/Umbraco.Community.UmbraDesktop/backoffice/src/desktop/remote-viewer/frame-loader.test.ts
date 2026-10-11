import { expect } from '@open-wc/testing';
import { loadRemoteFrame } from './frame-loader';

const FIXTURE = '/src/desktop/remote-viewer/frame-fixture.html';

describe('loading a remote viewer frame', () => {
  let frame: HTMLIFrameElement;

  beforeEach(() => {
    frame = document.createElement('iframe');
    document.body.append(frame);
  });

  afterEach(() => frame.remove());

  it('installs the shim on the document the frame navigates to', async () => {
    const handle = await loadRemoteFrame(frame, FIXTURE, {
      proxyBase: `${location.origin}/proxy`,
      remoteOrigin: 'https://client.example.com',
    });
    expect((handle.window.fetch as unknown as Record<string, unknown>).__remoteViewerShim).to.equal(true);
  });

  it('records every request the frame makes, well past the browser default of 250', async () => {
    // The backoffice loads hundreds of script files before its first data call. With the default
    // buffer the resource timing is full before the proxy is ever used, and the checks that read it
    // (settled, escaped, failed) see nothing: the real app reported a working frame as failed.
    const handle = await loadRemoteFrame(frame, FIXTURE, {
      proxyBase: `${location.origin}/proxy`,
      remoteOrigin: 'https://client.example.com',
    });
    const inner = frame.contentWindow!;
    // Read each body: a fetch's timing entry is recorded when its body has arrived, not when fetch()
    // resolves on the headers. Then yield once so the last entries are queued.
    await Promise.all(Array.from({ length: 300 }, (_, i) => inner.fetch(`${FIXTURE}?n=${i}`).then((r) => r.text())));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const recorded = inner.performance.getEntriesByType('resource').filter((entry) => entry.name.includes('?n='));
    expect(recorded.length).to.equal(300);
    expect(handle.escapedRequests()).to.deep.equal([]);
  });
});
