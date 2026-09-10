import { expect } from '@open-wc/testing';
import { backofficePathFromBaseHref } from './backoffice-path';

it('reads the backoffice path from the document base URI', () => {
  expect(backofficePathFromBaseHref('http://localhost:1234/umbraco/')).to.equal('/umbraco');
  expect(backofficePathFromBaseHref('http://localhost:1234/umbraco')).to.equal('/umbraco');
  // The path is configurable, so it is read rather than assumed.
  expect(backofficePathFromBaseHref('https://example.com/manage/')).to.equal('/manage');
  expect(backofficePathFromBaseHref('https://example.com/admin/backoffice/')).to.equal('/admin/backoffice');
});

it('falls back to /umbraco when there is no usable base', () => {
  // A document with no base element at all, or one served from the site root: neither can say
  // where the backoffice lives, and the default is the only honest guess.
  expect(backofficePathFromBaseHref(undefined)).to.equal('/umbraco');
  expect(backofficePathFromBaseHref('')).to.equal('/umbraco');
  expect(backofficePathFromBaseHref('https://example.com/')).to.equal('/umbraco');
});
