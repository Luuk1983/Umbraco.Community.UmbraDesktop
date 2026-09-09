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
 * @param host The provider element.
 */
function announce(host: HTMLElement): void {
  host.dispatchEvent(new Event('umb:context-provide', { bubbles: true, composed: true }));
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
  announce(host);

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
  announce(host);

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
  announce(host);

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
  announce(host);

  expect(seen).to.deep.equal([]);
  host.remove();
});
