import { expect } from '@open-wc/testing';
import { aliasesOf, watchProvidedContexts } from './frame-context.js';

/**
 * A stand-in for `UmbContextProvider`: an element that answers a context request for one
 * alias pair.
 *
 * Hand-built rather than imported from core, for the same reason the module under test does not
 * construct core's event class: what matters is the shape both sides agree on — a request event
 * carrying `contextAlias`, `apiAlias` and `callback` — and a stub proves the shape is respected
 * where the real provider would only prove the two happen to work together.
 * @param contextAlias The context alias this provider answers to.
 * @param apiAlias The api alias this provider answers to.
 * @param instance What it hands over.
 * @returns The provider element, already in the document.
 */
function provider(contextAlias: string, apiAlias: string, instance: unknown): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.addEventListener('umb:context-request', (event) => {
    const request = event as Event & {
      contextAlias: string;
      apiAlias: string;
      callback: (instance: unknown) => boolean;
    };
    if (request.contextAlias !== contextAlias || request.apiAlias !== apiAlias) return;
    if (request.callback(instance)) event.stopPropagation();
  });
  return host;
}

/**
 * Announce a provider the way `UmbContextProvider` does on connect.
 *
 * `contextAlias` is optional so a test can announce without one. Core's own
 * `UmbContextProvideEventImplementation` always sets it, but the watcher treats a missing alias as
 * "cannot tell, ask anyway" rather than as a mismatch, and that distinction needs a way to be
 * exercised from here.
 * @param host The provider element.
 * @param contextAlias The context alias to announce, or undefined to announce without one.
 */
function announce(host: HTMLElement, contextAlias?: string): void {
  const event = new Event('umb:context-provide', { bubbles: true, composed: true });
  if (contextAlias !== undefined) Object.assign(event, { contextAlias });
  host.dispatchEvent(event);
}

/**
 * Count the context requests that reach an element.
 *
 * The point of the alias guard is not that a mismatched request goes unanswered — a provider
 * already declines those — but that no request is *dispatched* at all, so nothing bubbles through
 * the composed tree for a context nobody is watching. Only a counter on the dispatching end can
 * tell those two apart.
 * @param host The element requests would be dispatched from.
 * @returns A function returning how many requests have been seen so far.
 */
function countRequests(host: HTMLElement): () => number {
  let seen = 0;
  host.addEventListener('umb:context-request', () => (seen += 1));
  return () => seen;
}

it('splits a token into its context and api aliases, defaulting the api alias', () => {
  expect(aliasesOf('UmbWorkspaceContext#UmbMenuStructure')).to.deep.equal([
    'UmbWorkspaceContext',
    'UmbMenuStructure',
  ]);
  expect(aliasesOf('UmbWorkspaceContext')).to.deep.equal(['UmbWorkspaceContext', 'default']);
});

it('hands over an instance the frame announces after watching started', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });

  const instance = { id: 'structure' };
  const host = provider('UmbWorkspaceContext', 'UmbMenuStructure', instance);
  announce(host, 'UmbWorkspaceContext');

  expect(seen).to.deep.equal([instance]);
  stop();
  host.remove();
});

it('ignores a provider announcing a different api alias', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });

  const host = provider('UmbWorkspaceContext', 'default', { id: 'workspace' });
  announce(host, 'UmbWorkspaceContext');

  expect(seen).to.deep.equal([]);
  stop();
  host.remove();
});

it('reaches a provider nested inside a shadow root, which is where every real one lives', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });

  const outer = document.createElement('div');
  document.body.appendChild(outer);
  const root = outer.attachShadow({ mode: 'open' });
  const host = document.createElement('div');
  root.appendChild(host);
  const instance = { id: 'nested' };
  host.addEventListener('umb:context-request', (event) => {
    const request = event as Event & { callback: (instance: unknown) => boolean };
    if (request.callback(instance)) event.stopPropagation();
  });
  announce(host, 'UmbWorkspaceContext');

  expect(seen).to.deep.equal([instance]);
  stop();
  outer.remove();
});

it('stops handing over instances once stopped', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });
  stop();

  const host = provider('UmbWorkspaceContext', 'UmbMenuStructure', { id: 'late' });
  announce(host, 'UmbWorkspaceContext');

  expect(seen).to.deep.equal([]);
  host.remove();
});

it('does not dispatch a request when the frame announces a context nobody here watches', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });

  const host = provider('UmbNotificationContext', 'default', { id: 'notifications' });
  const requests = countRequests(host);
  announce(host, 'UmbNotificationContext');

  // Nothing handed over, and — the point of the guard — nothing dispatched to find that out.
  expect(seen).to.deep.equal([]);
  expect(requests()).to.equal(0);
  stop();
  host.remove();
});

it('still asks when the frame announces without naming a context', () => {
  const seen: unknown[] = [];
  const stop = watchProvidedContexts(document, 'UmbWorkspaceContext', 'UmbMenuStructure', (instance) => {
    seen.push(instance);
    return true;
  });

  const instance = { id: 'unnamed' };
  const host = provider('UmbWorkspaceContext', 'UmbMenuStructure', instance);
  const requests = countRequests(host);
  announce(host);

  // A missing alias is "cannot tell", not "does not match": the guard only skips a provide event
  // that names a different context, so anything announcing without one is still asked.
  expect(seen).to.deep.equal([instance]);
  expect(requests()).to.equal(1);
  stop();
  host.remove();
});
