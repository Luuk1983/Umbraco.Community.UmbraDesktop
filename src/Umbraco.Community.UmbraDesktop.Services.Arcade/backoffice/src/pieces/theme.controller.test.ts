import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbStringState } from '@umbraco-cms/backoffice/observable-api';
import { ArcadeThemeController } from './theme.controller.js';

/** Stands in for the desktop, which provides its settings context to everything inside it. */
@customElement('umbradesktop-arcade-theme-test-desktop')
class TestDesktop extends UmbLitElement {}

/** Stands in for a piece. */
@customElement('umbradesktop-arcade-theme-test-piece')
class TestPiece extends UmbLitElement {
  constructor() {
    super();
    new ArcadeThemeController(this);
  }
}

it('stamps the desktop\'s theme on the piece and follows a change', async () => {
  const theme = new UmbStringState('win98');
  const desktop = await fixture<TestDesktop>(html`<umbradesktop-arcade-theme-test-desktop></umbradesktop-arcade-theme-test-desktop>`);
  desktop.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopSettingsContext'), { getHostElement: () => desktop, theme: theme.asObservable() } as never);
  const piece = document.createElement('umbradesktop-arcade-theme-test-piece') as TestPiece;
  desktop.append(piece);
  await waitUntil(() => piece.getAttribute('data-umbradesktop-theme') === 'win98', 'stamped');
  theme.setValue('macos');
  await waitUntil(() => piece.getAttribute('data-umbradesktop-theme') === 'macos', 'followed');
});

it('stamps nothing outside the desktop, so the unbranched Umbraco look applies', async () => {
  const piece = await fixture<TestPiece>(html`<umbradesktop-arcade-theme-test-piece></umbradesktop-arcade-theme-test-piece>`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(piece.hasAttribute('data-umbradesktop-theme')).to.equal(false);
});
