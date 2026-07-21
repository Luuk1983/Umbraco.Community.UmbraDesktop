import { expect } from '@open-wc/testing';
import { buildHeaderCss, buildSidebarCss } from './chrome-injector';

it('header CSS hides the backoffice header and fills the main height', () => {
  const css = buildHeaderCss();
  expect(css).to.contain('umb-backoffice-header');
  expect(css).to.contain('display: none');
  expect(css).to.contain('umb-backoffice-main');
  expect(css).to.contain('height: 100%');
});

it('sidebar CSS hides the section sidebar', () => {
  expect(buildSidebarCss()).to.contain('umb-section-sidebar');
  expect(buildSidebarCss()).to.contain('display: none');
});

it('sidebar CSS lifts the section main area to fill the section body', () => {
  const css = buildSidebarCss();
  expect(css).to.contain('umb-section-main');
  expect(css).to.contain('position: absolute');
  expect(css).to.contain('inset: 0');
});
