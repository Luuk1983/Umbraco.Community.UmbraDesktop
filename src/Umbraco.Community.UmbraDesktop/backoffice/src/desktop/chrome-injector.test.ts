import { expect } from '@open-wc/testing';
import {
  buildHeaderCss,
  buildSidebarCss,
  buildDashboardTabsCss,
  findShadowRootWith,
  findDashboardChromeRoot,
} from './chrome-injector';

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

it('dashboard-tabs CSS hides the section dashboard header bar', () => {
  const css = buildDashboardTabsCss();
  expect(css).to.contain('#header');
  expect(css).to.contain('display: none');
});

it('findDashboardChromeRoot returns the umb-body-layout shadow root nested under umb-section-main-views', () => {
  // document > [host] #shadow > umb-section-main-views #shadow > umb-body-layout #shadow > div#header
  const host = document.createElement('div');
  const outer = host.attachShadow({ mode: 'open' });
  const views = document.createElement('umb-section-main-views');
  outer.appendChild(views);
  const viewsRoot = views.attachShadow({ mode: 'open' });
  const layout = document.createElement('umb-body-layout');
  viewsRoot.appendChild(layout);
  const layoutRoot = layout.attachShadow({ mode: 'open' });
  const header = document.createElement('div');
  header.id = 'header';
  layoutRoot.appendChild(header);
  document.body.appendChild(host);

  try {
    const found = findDashboardChromeRoot(document);
    expect(found).to.equal(layoutRoot);
  } finally {
    host.remove();
  }
});

it('findDashboardChromeRoot returns null when no umb-section-main-views is mounted', () => {
  expect(findDashboardChromeRoot(document)).to.equal(null);
});

it('findShadowRootWith locates the nested shadow root that owns a matching element', () => {
  // Build document > [host] #shadow > inner > #shadow > span[data-mark]
  const host = document.createElement('div');
  const outer = host.attachShadow({ mode: 'open' });
  const inner = document.createElement('div');
  outer.appendChild(inner);
  const innerRoot = inner.attachShadow({ mode: 'open' });
  const marker = document.createElement('span');
  marker.setAttribute('data-mark', 'section-link:Test.Section');
  innerRoot.appendChild(marker);
  document.body.appendChild(host);

  try {
    const found = findShadowRootWith(document, 'span[data-mark="section-link:Test.Section"]');
    expect(found).to.equal(innerRoot);
  } finally {
    host.remove();
  }
});
