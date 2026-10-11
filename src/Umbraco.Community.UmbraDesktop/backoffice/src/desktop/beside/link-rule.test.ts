import { expect } from '@open-wc/testing';
import { besideLinkAction } from './link-rule';

/**
 * The link rule (design §5): a link in a pane navigates the owner window, as it would from the
 * view's tab, and every click the tab would leave to the browser is left to it. Clicks are built as
 * real events on real anchors inside a shadow root, because the rule reads the composed path.
 */

const BASE = `${window.location.origin}/umbraco/`;

/** Everything a case put in the page, removed after it. */
let mounted: Element[] = [];

afterEach(() => {
  for (const element of mounted) element.remove();
  mounted = [];
});

/**
 * Click inside an anchor in a shadow root and hand the event to the rule while it is in flight.
 * @param attributes The anchor's attributes.
 * @param init The click's modifiers and button.
 * @param prevented Whether the view handled the click first.
 * @returns What the rule said.
 */
function click(attributes: Record<string, string>, init: MouseEventInit = {}, prevented = false) {
  const host = document.createElement('div');
  const anchor = document.createElement('a');
  for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
  const label = document.createElement('span');
  anchor.append(label);
  host.attachShadow({ mode: 'open' }).append(anchor);
  document.body.append(host);
  mounted.push(host);
  let result: ReturnType<typeof besideLinkAction>;
  if (prevented) label.addEventListener('click', (event) => event.preventDefault());
  host.addEventListener('click', (event) => {
    result = besideLinkAction(event as MouseEvent, BASE);
    // Never let the test page itself navigate.
    event.preventDefault();
  });
  label.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init }));
  return result;
}

it('sends a backoffice link to the owner, resolved the way the backoffice resolves it', () => {
  expect(click({ href: 'section/settings/workspace/template/edit/abc' })).to.deep.equal({
    action: 'route',
    path: '/umbraco/section/settings/workspace/template/edit/abc',
  });
  expect(click({ href: '/umbraco/section/content/workspace/document/edit/x?a=1#b' })).to.deep.equal({
    action: 'route',
    path: '/umbraco/section/content/workspace/document/edit/x?a=1#b',
  });
});

it('leaves modifier clicks, other buttons, new-tab targets, downloads and other origins to the browser', () => {
  expect(click({ href: 'section/content' }, { ctrlKey: true })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content' }, { metaKey: true })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content' }, { shiftKey: true })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content' }, { altKey: true })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content' }, { button: 1 })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content', target: '_blank' })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'section/content', download: '' })).to.deep.equal({ action: 'pass' });
  expect(click({ href: 'https://example.com/umbraco/section/content' })).to.deep.equal({ action: 'pass' });
});

it('still sends a link that names its own frame as the target to the owner', () => {
  expect(click({ href: 'section/content', target: '_self' })?.action).to.equal('route');
});

it('leaves a click the view already handled alone', () => {
  expect(click({ href: 'section/content' }, {}, true)).to.deep.equal({ action: 'pass' });
});

it('leaves a same-origin link outside the backoffice to the browser', () => {
  expect(click({ href: '/media/abc/hero.jpg' })).to.deep.equal({ action: 'pass' });
});

it('loads a link the backoffice keeps away from its router in the owner, rather than routing it', () => {
  expect(click({ href: 'section/content', 'data-router-slot': 'disabled' })).to.deep.equal({
    action: 'load',
    path: '/umbraco/section/content',
  });
});

it('says nothing about a click that is not on a link', () => {
  const host = document.createElement('button');
  document.body.append(host);
  mounted.push(host);
  let result: ReturnType<typeof besideLinkAction> = { action: 'pass' };
  host.addEventListener('click', (event) => (result = besideLinkAction(event as MouseEvent, BASE)));
  host.click();
  expect(result).to.equal(undefined);
});
