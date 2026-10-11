import { expect } from '@open-wc/testing';
import './beside-host.element.js';
import type { UmbraDesktopBesideHostElement } from './beside-host.element.js';
import { announceWindowFrame, forgetWindowFrame } from './owner-frames';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

/**
 * The host as a whole: it builds the view from the desktop page's registry, answers the view's
 * requests from the owner's frame, remounts when the owner reloads, and sends a link to the owner.
 * A same-origin blank frame with plain elements under core's tag names stands in for the owner.
 */

/** How long a case may take: it waits on a frame. */
const TIMEOUT_MS = 10_000;

/** The view's alias in the registry. */
const VIEW_ALIAS = 'Test.WorkspaceView.Beside';

/**
 * A view that asks for one context as it connects, the way a consumer does, and keeps the answer.
 */
class ProbeViewElement extends HTMLElement {
  /** What the owner answered with. */
  public answer: unknown;
  /** The manifest the host set on it, as core's workspace editor does. */
  public manifest: unknown;

  connectedCallback() {
    const event = new Event('umb:context-request', { bubbles: true, composed: true, cancelable: true });
    Object.assign(event, {
      contextAlias: 'UmbWorkspaceContext',
      apiAlias: 'default',
      stopAtContextMatch: true,
      callback: (instance: unknown) => ((this.answer = instance), true),
    });
    this.dispatchEvent(event);
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<a href="section/settings/workspace/template/edit/abc">template</a>';
  }
}
customElements.define('umbradesktop-test-beside-view', ProbeViewElement);

/** Everything a case set up, undone after it. */
let cleanup: Array<() => void> = [];

before(() => {
  umbExtensionsRegistry.register({
    type: 'workspaceView',
    alias: VIEW_ALIAS,
    name: 'Probe view',
    element: ProbeViewElement,
    meta: { label: 'Probe', pathname: 'probe', icon: 'icon-info' },
  } as unknown as UmbExtensionManifest);
});

afterEach(() => {
  for (const undo of cleanup) undo();
  cleanup = [];
});

/**
 * An owner frame showing a document, whose editor provides a workspace.
 * @param workspace What the editor's provider answers with.
 * @returns The frame.
 */
async function ownerFrame(workspace: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  cleanup.push(() => iframe.remove());
  await new Promise((resolve) => setTimeout(resolve, 0));
  fillFrame(iframe, workspace);
  return iframe;
}

/**
 * Render a document workspace in a frame, replacing whatever it held, as a reload would.
 * @param iframe The frame.
 * @param workspace What the editor's provider answers with.
 */
function fillFrame(iframe: HTMLIFrameElement, workspace: string) {
  const doc = iframe.contentDocument!;
  const editor = doc.createElement('umb-workspace-editor');
  editor.addEventListener('umb:context-request', (raw) => {
    const event = raw as Event & { contextAlias: string; callback: (i: unknown) => boolean };
    if (event.contextAlias !== 'UmbWorkspaceContext') return;
    event.stopPropagation();
    if (event.callback(workspace)) event.stopImmediatePropagation();
  });
  const workspaceEditor = doc.createElement('umb-document-workspace-editor');
  workspaceEditor.attachShadow({ mode: 'open' }).append(editor);
  doc.body.replaceChildren(workspaceEditor);
}

/**
 * Mount a host for one owner.
 * @param ownerId The owner's window id.
 * @returns The host.
 */
async function mountHost(ownerId: string): Promise<UmbraDesktopBesideHostElement> {
  const host = document.createElement('umbradesktop-beside-host') as UmbraDesktopBesideHostElement;
  host.ownerId = ownerId;
  host.viewAlias = VIEW_ALIAS;
  document.body.append(host);
  cleanup.push(() => host.remove());
  return host;
}

/**
 * Wait until the host has a view mounted.
 * @param host The host.
 * @returns The view.
 */
async function mountedView(host: UmbraDesktopBesideHostElement): Promise<ProbeViewElement> {
  for (let i = 0; i < 200; i++) {
    const view = host.shadowRoot?.querySelector('umbradesktop-test-beside-view') as ProbeViewElement | null;
    if (view) return view;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the view never mounted');
}

it('builds the view and answers it from the owner’s workspace', async function () {
  this.timeout(TIMEOUT_MS);
  const iframe = await ownerFrame('the owner’s workspace');
  announceWindowFrame('owner-a', iframe);
  cleanup.push(() => forgetWindowFrame('owner-a'));
  const host = await mountHost('owner-a');
  const view = await mountedView(host);
  expect(view.answer).to.equal('the owner’s workspace');
  expect((view.manifest as { alias: string }).alias).to.equal(VIEW_ALIAS);
});

it('builds the view again against the owner’s page after it reloads', async function () {
  this.timeout(TIMEOUT_MS);
  const iframe = await ownerFrame('before');
  announceWindowFrame('owner-b', iframe);
  cleanup.push(() => forgetWindowFrame('owner-b'));
  const host = await mountHost('owner-b');
  const first = await mountedView(host);
  fillFrame(iframe, 'after');
  announceWindowFrame('owner-b', iframe);
  let second = first;
  for (let i = 0; i < 200 && second === first; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    second = (host.shadowRoot?.querySelector('umbradesktop-test-beside-view') as ProbeViewElement | null) ?? first;
  }
  expect(second).to.not.equal(first);
  expect(second.answer).to.equal('after');
});

it('sends a backoffice link in the view to the owner, and keeps the desktop where it is', async function () {
  this.timeout(TIMEOUT_MS);
  const iframe = await ownerFrame('w');
  announceWindowFrame('owner-c', iframe);
  cleanup.push(() => forgetWindowFrame('owner-c'));
  const host = await mountHost('owner-c');
  const view = await mountedView(host);
  const pushed: string[] = [];
  const history = iframe.contentWindow!.history;
  history.pushState = (_data: unknown, _unused: string, url?: string | URL | null) => {
    pushed.push(String(url));
  };
  let reachedPage = false;
  const onPage = () => (reachedPage = true);
  window.addEventListener('click', onPage);
  cleanup.push(() => window.removeEventListener('click', onPage));
  const before = window.location.href;
  view.shadowRoot!.querySelector('a')!.click();
  // Resolved against the page's base, as the backoffice resolves it against its own.
  expect(pushed).to.deep.equal([new URL('section/settings/workspace/template/edit/abc', document.baseURI).pathname]);
  expect(reachedPage, 'the desktop page’s router never sees it').to.equal(false);
  expect(window.location.href).to.equal(before);
});
