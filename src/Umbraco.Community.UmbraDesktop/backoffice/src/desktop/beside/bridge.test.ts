import { expect } from '@open-wc/testing';
import { acceptForeignInstances, forwardContextRequest, relayProvideEvents } from './bridge';

/**
 * The bridge between a pane on the desktop page and its owner's frame (design §4.2 to §4.4). Two
 * pages are two realms in the backoffice; here plain elements, classes and event targets stand in
 * for each side, since what is under test is the routing, not the realms.
 */

/** Everything a case put in the page, removed after it. */
let mounted: Element[] = [];

afterEach(() => {
  for (const element of mounted) element.remove();
  mounted = [];
});

/**
 * Mount an element.
 * @param element The element.
 * @returns It, mounted.
 */
function mount<T extends Element>(element: T): T {
  document.body.append(element);
  mounted.push(element);
  return element;
}

/** A context request as core's consumer builds it: a plain event with its four fields. */
function request(contextAlias: string, callback: (instance: unknown) => boolean, apiAlias = 'default') {
  const event = new Event('umb:context-request', { bubbles: true, composed: true, cancelable: true });
  Object.assign(event, { contextAlias, apiAlias, callback, stopAtContextMatch: true });
  return event;
}

/**
 * A provider stand-in, listening as core's `UmbContextProvider` does: it stops a request whose
 * context alias matches, and answers it only when the api alias matches and the callback accepts.
 * @param target Where it listens.
 * @param contextAlias The context it provides.
 * @param instance What it hands over.
 * @param apiAlias The api alias it provides under.
 */
function provide(target: EventTarget, contextAlias: string, instance: unknown, apiAlias = 'default') {
  target.addEventListener('umb:context-request', (raw) => {
    const event = raw as Event & { contextAlias: string; apiAlias: string; callback: (i: unknown) => boolean; stopAtContextMatch: boolean };
    if (event.contextAlias !== contextAlias) return;
    if (event.stopAtContextMatch) event.stopPropagation();
    if (event.apiAlias === apiAlias && event.callback(instance)) event.stopImmediatePropagation();
  });
}

/**
 * A pane: a page-side ancestor, the host inside it, and a view inside the host's shadow root, with
 * the host forwarding every request to `anchor` and falling back to the ancestor.
 * @param anchor The frame's anchor stand-in.
 * @returns The parts, and what each forward reported.
 */
function pane(anchor: Element) {
  const page = mount(document.createElement('div'));
  const host = document.createElement('div');
  page.append(host);
  const viewElement = document.createElement('div');
  host.attachShadow({ mode: 'open' }).append(viewElement);
  const outcomes: string[] = [];
  host.addEventListener('umb:context-request', (event) => outcomes.push(forwardContextRequest(event, anchor, host)));
  return { page, host, view: viewElement, outcomes };
}

describe('forwarding a request to the owner', () => {
  it('reaches the frame’s anchor and is answered from there', () => {
    const frame = mount(document.createElement('div'));
    const anchor = frame.appendChild(document.createElement('div'));
    provide(frame, 'UmbWorkspaceContext', 'the owner’s workspace');
    const { view, outcomes } = pane(anchor);

    let received: unknown;
    view.dispatchEvent(request('UmbWorkspaceContext', (instance) => ((received = instance), true)));

    expect(received).to.equal('the owner’s workspace');
    expect(outcomes).to.deep.equal(['answered']);
  });

  it('never reaches the desktop page’s own providers once forwarded', () => {
    const frame = mount(document.createElement('div'));
    const { page, view } = pane(frame.appendChild(document.createElement('div')));
    provide(frame, 'UmbModalManagerContext', 'the owner’s modals');
    provide(page, 'UmbModalManagerContext', 'the desktop’s modals');

    let received: unknown;
    view.dispatchEvent(request('UmbModalManagerContext', (instance) => ((received = instance), true)));

    expect(received).to.equal('the owner’s modals');
  });

  it('does not fall back when the frame matched the alias but turned the request down', () => {
    // Core's provider stops a request whose context alias matches even when the api alias does not,
    // so the frame had the say, and asking the desktop page as well would hand back a stranger.
    const frame = mount(document.createElement('div'));
    const { page, view, outcomes } = pane(frame.appendChild(document.createElement('div')));
    provide(frame, 'UmbWorkspaceContext', 'a workspace', 'other');
    provide(page, 'UmbWorkspaceContext', 'the desktop’s');

    let received: unknown = 'nothing';
    view.dispatchEvent(request('UmbWorkspaceContext', (instance) => ((received = instance), true)));

    expect(received).to.equal('nothing');
    expect(outcomes).to.deep.equal(['matched']);
  });

  it('falls back to the desktop page when the frame neither answered nor matched', () => {
    const frame = mount(document.createElement('div'));
    const { page, view, outcomes } = pane(frame.appendChild(document.createElement('div')));
    provide(page, 'UmbIconRegistryContext', 'the desktop’s icons');

    let received: unknown;
    view.dispatchEvent(request('UmbIconRegistryContext', (instance) => ((received = instance), true)));

    expect(received).to.equal('the desktop’s icons');
    expect(outcomes).to.deep.equal(['missed']);
  });

  it('falls back from the host’s shadow root’s host when the host sits directly in a shadow root', () => {
    // A node directly in a shadow root has no parent element, so the fallback has to start from the
    // element that root belongs to.
    const frame = mount(document.createElement('div'));
    const anchor = frame.appendChild(document.createElement('div'));
    const outer = mount(document.createElement('div'));
    const host = document.createElement('div');
    outer.attachShadow({ mode: 'open' }).append(host);
    const inner = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(inner);
    host.addEventListener('umb:context-request', (event) => forwardContextRequest(event, anchor, host));
    provide(outer, 'UmbIconRegistryContext', 'icons');

    let received: unknown;
    inner.dispatchEvent(request('UmbIconRegistryContext', (instance) => ((received = instance), true)));

    expect(received).to.equal('icons');
  });
});

describe('modal tokens from the other page', () => {
  it('pass the frame class’s instanceof, alongside its own', () => {
    class FrameToken {}
    class PageToken {}
    acceptForeignInstances(FrameToken, PageToken);
    expect(new PageToken() instanceof FrameToken).to.equal(true);
    expect(new FrameToken() instanceof FrameToken).to.equal(true);
  });

  it('let nothing else newly pass', () => {
    class FrameToken {}
    class PageToken {}
    class Other {}
    class FrameSubToken extends FrameToken {}
    acceptForeignInstances(FrameToken, PageToken);
    expect({} instanceof FrameToken).to.equal(false);
    expect(new Other() instanceof FrameToken).to.equal(false);
    expect(new PageToken() instanceof FrameSubToken, 'a subclass keeps its own answer').to.equal(false);
    expect(new FrameSubToken() instanceof FrameToken).to.equal(true);
    expect(new FrameToken() instanceof PageToken, 'the page’s class is left alone').to.equal(false);
  });

  it('can be applied again, as it is on every frame load, without stacking', () => {
    class FrameToken {}
    class PageToken {}
    acceptForeignInstances(FrameToken, PageToken);
    acceptForeignInstances(FrameToken, PageToken);
    expect(new PageToken() instanceof FrameToken).to.equal(true);
    expect({} instanceof FrameToken).to.equal(false);
  });
});

describe('relaying the frame’s provide events', () => {
  /**
   * A provide event as core fires it: bubbling and composed, naming only its context alias.
   * @param contextAlias The alias.
   * @returns The event.
   */
  function provideEvent(contextAlias: string) {
    const event = new Event('umb:context-provide', { bubbles: true, composed: true });
    Object.assign(event, { contextAlias });
    return event;
  }

  it('reaches the page’s window for an alias the pane asked for', () => {
    const frameWindow = new EventTarget();
    const pageWindow = new EventTarget();
    const heard: string[] = [];
    pageWindow.addEventListener('umb:context-provide', (event) => heard.push((event as Event & { contextAlias: string }).contextAlias));
    relayProvideEvents(frameWindow, pageWindow, (alias) => alias === 'UmbPropertyDatasetContext');

    frameWindow.dispatchEvent(provideEvent('UmbPropertyDatasetContext'));
    frameWindow.dispatchEvent(provideEvent('UmbSomethingElse'));

    expect(heard).to.deep.equal(['UmbPropertyDatasetContext']);
  });

  it('stops when asked to', () => {
    const frameWindow = new EventTarget();
    const pageWindow = new EventTarget();
    let heard = 0;
    pageWindow.addEventListener('umb:context-provide', () => heard++);
    const stop = relayProvideEvents(frameWindow, pageWindow, () => true);
    stop();

    frameWindow.dispatchEvent(provideEvent('UmbPropertyDatasetContext'));

    expect(heard).to.equal(0);
  });
});
