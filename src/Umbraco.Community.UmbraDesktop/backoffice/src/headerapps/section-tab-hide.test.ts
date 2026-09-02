import { expect } from '@open-wc/testing';
import { applySectionTabHide, buildSectionTabHideCss, sectionTabSelector } from './section-tab-hide';

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

/**
 * Builds the shadow-DOM shape the backoffice header renders:
 * host #shadow > uui-tab-group > uui-tab[data-mark], plus uui-tab-group's own
 * shadow root (where the overflow dropdown clones live).
 */
function mountHeaderSections(alias: string) {
  const host = document.createElement('div');
  const sectionsRoot = host.attachShadow({ mode: 'open' });
  const group = document.createElement('uui-tab-group');
  sectionsRoot.appendChild(group);
  const groupRoot = group.attachShadow({ mode: 'open' });
  const dropdown = document.createElement('div');
  dropdown.id = 'hidden-tabs-container';
  groupRoot.appendChild(dropdown);
  const tab = document.createElement('uui-tab');
  tab.setAttribute('data-mark', `section-link:${alias}`);
  group.appendChild(tab);
  document.body.appendChild(host);
  return { host, sectionsRoot, groupRoot, dropdown, tab };
}

it('applySectionTabHide covers the tab-group overflow dropdown as well as the tab list', () => {
  const dom = mountHeaderSections('My.Section');
  try {
    expect(applySectionTabHide('My.Section', document)).to.be.true;
    const rule = buildSectionTabHideCss('My.Section');
    expect(dom.sectionsRoot.querySelector('style')?.textContent).to.contain(rule);
    // The dropdown clone lives in uui-tab-group's own shadow root, which the tab-list
    // stylesheet cannot reach — it needs its own copy of the rule.
    expect(dom.groupRoot.querySelector('style')?.textContent).to.contain(rule);
  } finally {
    dom.host.remove();
  }
});

it('applySectionTabHide is idempotent — repeated calls keep one style per root', () => {
  const dom = mountHeaderSections('My.Section');
  try {
    applySectionTabHide('My.Section', document);
    applySectionTabHide('My.Section', document);
    expect(dom.sectionsRoot.querySelectorAll('style').length).to.equal(1);
    expect(dom.groupRoot.querySelectorAll('style').length).to.equal(1);
  } finally {
    dom.host.remove();
  }
});

it('applySectionTabHide reports false when the section tab is not mounted', () => {
  expect(applySectionTabHide('Not.Mounted', document)).to.be.false;
});
