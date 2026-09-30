import { expect } from '@open-wc/testing';
import { installRemoteShim, type ShimWindow } from './install-shim';

const origin = 'http://127.0.0.1:5201';
const proxyBase = `${origin}/umbraco/management/api/v1/umbradesktop/connection-proxy/c1`;
const remoteOrigin = 'https://client.example.com';
const options = { proxyBase, remoteOrigin };

/** Records what the wrapped fetch was finally asked to do. */
interface Sent {
  url: string;
  method: string;
  credentials?: RequestCredentials;
  headers: Headers;
}

/** A window with just enough in it for the shim, and a fetch that answers without a network. */
function fakeWindow(): {
  win: ShimWindow;
  sent: Sent[];
  opened: Array<{ method: string; url: string }>;
  xhrHeaders: string[];
} {
  const sent: Sent[] = [];
  const opened: Array<{ method: string; url: string }> = [];
  const xhrHeaders: string[] = [];
  class FakeXhr {
    withCredentials = true;
    open(method: string, url: string | URL) {
      opened.push({ method, url: String(url) });
    }
    setRequestHeader(name: string) {
      xhrHeaders.push(name.toLowerCase());
    }
  }
  const win = {
    origin,
    location: { href: origin + '/umbraco/section/content' },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      sent.push({
        url: request ? request.url : String(input),
        method: init?.method ?? request?.method ?? 'GET',
        credentials: init?.credentials ?? request?.credentials,
        headers: new Headers(init?.headers ?? request?.headers),
      });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    XMLHttpRequest: FakeXhr,
  } as unknown as ShimWindow;
  return { win, sent, opened, xhrHeaders };
}

describe('remote viewer fetch shim', () => {
  it('sends a data call to the proxy as the local user, credentials and bearer intact', async () => {
    // The proxy is this instance's own endpoint, so the call has to arrive logged in here. The
    // proxy then swaps the local user for the connection's API user, out of the browser's reach.
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    await win.fetch('/umbraco/management/api/v1/tree/document/root?skip=0', {
      credentials: 'include',
      headers: { Authorization: 'Bearer [redacted]', Accept: 'application/json' },
    });
    expect(sent.length).to.equal(1);
    expect(sent[0].url).to.equal(`${proxyBase}/umbraco/management/api/v1/tree/document/root?skip=0`);
    expect(sent[0].credentials).to.equal('include');
    expect(sent[0].headers.get('authorization')).to.equal('Bearer [redacted]');
    expect(sent[0].headers.get('accept')).to.equal('application/json');
  });

  it('handles a Request object, which is what the generated client passes', async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    await win.fetch(new Request(origin + '/umbraco/management/api/v1/language', { headers: { Authorization: 'Bearer [redacted]' } }));
    expect(sent[0].url).to.equal(`${proxyBase}/umbraco/management/api/v1/language`);
    expect(sent[0].headers.get('authorization')).to.equal('Bearer [redacted]');
  });

  it('fetches media straight from the remote, anonymously, because media is public there', async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    await win.fetch('/media/abcd/photo.jpg', { credentials: 'include', headers: { Authorization: 'Bearer [redacted]' } });
    expect(sent[0].url).to.equal(`${remoteOrigin}/media/abcd/photo.jpg`);
    expect(sent[0].credentials).to.equal('omit');
    expect(sent[0].headers.has('authorization')).to.equal(false);
  });

  it('leaves an auth call alone, so the frame stays logged in locally', async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    await win.fetch('/umbraco/management/api/v1/security/back-office/token', { method: 'POST', credentials: 'include' });
    expect(sent[0].url).to.equal('/umbraco/management/api/v1/security/back-office/token');
  });

  it('does not redirect a call that is already to the proxy', async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    await win.fetch(`${proxyBase}/umbraco/management/api/v1/language`);
    expect(sent[0].url).to.equal(`${proxyBase}/umbraco/management/api/v1/language`);
  });

  it("refuses SignalR's negotiate call to this instance and never sends it", async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    const response = await win.fetch('/umbraco/serverEventHub/negotiate?negotiateVersion=1', { method: 'POST' });
    expect(response.ok).to.equal(false);
    expect(sent.length).to.equal(0);
  });

  it('answers a write to the remote with 405 and never sends it', async () => {
    const { win, sent } = fakeWindow();
    installRemoteShim(win, options);
    const response = await win.fetch('/umbraco/management/api/v1/document/x', { method: 'PUT', body: '{}' });
    expect(response.status).to.equal(405);
    expect(sent.length).to.equal(0);
  });
});

describe('remote viewer XMLHttpRequest shim', () => {
  it('opens a data call against the proxy and keeps the local credentials', () => {
    const { win, opened } = fakeWindow();
    installRemoteShim(win, options);
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', '/umbraco/management/api/v1/media/urls?id=1');
    expect(opened[0].url).to.equal(`${proxyBase}/umbraco/management/api/v1/media/urls?id=1`);
    expect(xhr.withCredentials).to.equal(true);
  });

  it('keeps the bearer header on a proxied call and drops it on a media one', () => {
    const { win, xhrHeaders } = fakeWindow();
    installRemoteShim(win, options);
    const proxied = new win.XMLHttpRequest();
    proxied.open('GET', '/umbraco/management/api/v1/media/urls');
    proxied.setRequestHeader('Authorization', 'Bearer [redacted]');
    const media = new win.XMLHttpRequest();
    media.open('GET', '/media/abcd/photo.jpg');
    media.setRequestHeader('Authorization', 'Bearer [redacted]');
    expect(xhrHeaders).to.deep.equal(['authorization']);
    expect(media.withCredentials).to.equal(false);
  });

  it('refuses to open a write to the remote', () => {
    const { win } = fakeWindow();
    installRemoteShim(win, options);
    const xhr = new win.XMLHttpRequest();
    expect(() => xhr.open('POST', '/umbraco/management/api/v1/temporary-file')).to.throw();
  });
});

describe('remote viewer in a real frame', () => {
  let frame: HTMLIFrameElement;

  afterEach(() => frame?.remove());

  /** The blank frame every navigation starts from, patched before it goes anywhere. */
  function patchedFrame(): HTMLIFrameElement {
    frame = document.createElement('iframe');
    document.body.append(frame);
    installRemoteShim(frame.contentWindow as unknown as ShimWindow, options);
    return frame;
  }

  it('does NOT keep a patch made on the blank frame through its first navigation', async () => {
    // Recorded because the design first assumed the opposite. The spec lets a same-origin first
    // navigation reuse the blank window, and Chrome does reuse the window, but it builds a fresh
    // JavaScript context, so own properties such as a patched fetch are gone. The frame therefore
    // has to be patched after it commits, and frame-loader.ts checks nothing got in ahead of it.
    const target = patchedFrame();
    await new Promise<void>((resolve) => {
      target.addEventListener('load', () => resolve(), { once: true });
      target.src = '/src/desktop/remote-viewer/frame-fixture.html';
    });
    const inner = target.contentWindow as unknown as ShimWindow & { fetchWasPatchedAtStart?: boolean };
    expect(inner.fetchWasPatchedAtStart).to.equal(false);
  });

  it('points an image with a media path at the remote', () => {
    const target = patchedFrame();
    const img = target.contentDocument!.createElement('img');
    img.src = '/media/abcd/photo.jpg';
    expect(img.getAttribute('src')).to.equal(`${remoteOrigin}/media/abcd/photo.jpg`);
    const viaAttribute = target.contentDocument!.createElement('img');
    viaAttribute.setAttribute('src', '/media/efgh/other.png');
    expect(viaAttribute.getAttribute('src')).to.equal(`${remoteOrigin}/media/efgh/other.png`);
  });

  it("refuses a WebSocket to this instance, which is how SignalR would hear this instance's events", () => {
    const target = patchedFrame();
    const inner = target.contentWindow as unknown as { WebSocket: typeof WebSocket };
    const host = location.host;
    expect(() => new inner.WebSocket(`ws://${host}/umbraco/serverEventHub?id=abc`)).to.throw();
    expect(() => new inner.WebSocket(`ws://${host}/anything/else`)).to.throw();
  });

  it('leaves a WebSocket to somewhere else alone', () => {
    const target = patchedFrame();
    const inner = target.contentWindow as unknown as { WebSocket: typeof WebSocket };
    const socket = new inner.WebSocket('ws://127.0.0.1:9/');
    expect(socket).to.be.instanceOf(inner.WebSocket);
    socket.close();
  });

  it('refuses an EventSource to this instance, the fallback SignalR would reach for', () => {
    const target = patchedFrame();
    const inner = target.contentWindow as unknown as { EventSource: typeof EventSource };
    expect(() => new inner.EventSource('/umbraco/serverEventHub?id=abc')).to.throw();
  });

  it('leaves an image that is not media alone', () => {
    const target = patchedFrame();
    const img = target.contentDocument!.createElement('img');
    img.src = '/umbraco/backoffice/assets/logo.svg';
    expect(img.getAttribute('src')).to.equal('/umbraco/backoffice/assets/logo.svg');
  });
});
