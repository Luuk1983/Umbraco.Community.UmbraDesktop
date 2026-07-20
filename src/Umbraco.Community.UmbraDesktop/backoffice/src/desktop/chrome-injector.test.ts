import { expect } from '@open-wc/testing';
import { buildChromeCss } from './chrome-injector';

it('every profile hides the outer backoffice header', () => {
  for (const p of ['full-section', 'workspace-only', 'bare'] as const) {
    expect(buildChromeCss(p)).to.contain('umb-backoffice-header');
    expect(buildChromeCss(p)).to.contain('display: none');
  }
});

it('full-section keeps the section sidebar', () => {
  expect(buildChromeCss('full-section')).to.not.contain('umb-section-sidebar');
});

it('workspace-only and bare also hide the section sidebar', () => {
  expect(buildChromeCss('workspace-only')).to.contain('umb-section-sidebar');
  expect(buildChromeCss('bare')).to.contain('umb-section-sidebar');
});

it('makes the main area fill the viewport height', () => {
  expect(buildChromeCss('full-section')).to.contain('umb-backoffice-main');
  expect(buildChromeCss('full-section')).to.contain('height: 100%');
});
