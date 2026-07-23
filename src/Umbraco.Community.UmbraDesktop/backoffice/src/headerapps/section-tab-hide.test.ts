import { expect } from '@open-wc/testing';
import { buildSectionTabHideCss, sectionTabSelector } from './section-tab-hide';

it('selector targets a section nav tab by its data-mark alias', () => {
  expect(sectionTabSelector('Umbraco.Community.UmbraDesktop.Section')).to.equal(
    'uui-tab[data-mark="section-link:Umbraco.Community.UmbraDesktop.Section"]',
  );
});

it('hide CSS sets display:none on the matched section tab', () => {
  const css = buildSectionTabHideCss('My.Section');
  expect(css).to.contain('uui-tab[data-mark="section-link:My.Section"]');
  expect(css).to.contain('display: none');
});
