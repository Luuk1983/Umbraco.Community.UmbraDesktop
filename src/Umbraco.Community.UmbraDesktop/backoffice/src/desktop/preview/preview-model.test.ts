import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER,
  UMBRADESKTOP_PREVIEW_APP_ALIAS,
  UMBRADESKTOP_PREVIEW_OPEN_WIDTH,
  UMBRADESKTOP_PREVIEW_WIDTHS,
  createPreviewApp,
  previewOptions,
  previewRefreshesItself,
  previewReloadNeeded,
} from './preview-model';

const TARGET = { unique: 'ca4249ed-2b23-4337-b522-63cabe5587d1', culture: 'en-US', segment: undefined };

describe('createPreviewApp', () => {
  it('is one kind per owner, so a second request focuses the first', () => {
    expect(createPreviewApp('owner-1', TARGET, 'Preview: Home').alias).to.equal(UMBRADESKTOP_PREVIEW_APP_ALIAS);
  });

  it('is titled as it was asked to be', () => {
    expect(createPreviewApp('owner-1', TARGET, 'Preview: Home').name).to.equal('Preview: Home');
  });

  it("opens at the width Umbraco's own preview page needs, which is the backoffice's", () => {
    expect(createPreviewApp('owner-1', TARGET, 'Preview: Home').defaultSize?.w).to.equal(UMBRADESKTOP_PREVIEW_OPEN_WIDTH);
    expect(UMBRADESKTOP_PREVIEW_OPEN_WIDTH).to.be.at.least(920);
  });

  it('can still be narrowed to a phone width, which a headless front-end can use', () => {
    expect(createPreviewApp('owner-1', TARGET, 'Preview: Home').minSize?.w).to.be.at.most(UMBRADESKTOP_PREVIEW_WIDTHS.phone);
  });

  it('tells its body which window and document it belongs to', () => {
    const app = createPreviewApp('owner-1', TARGET, 'Preview: Home');
    expect(app.content.kind).to.equal('element');
    if (app.content.kind !== 'element') return;
    expect(app.content.props).to.deep.equal({ ownerId: 'owner-1', target: TARGET });
  });
});

describe('previewOptions', () => {
  const option = (alias: string, urlProviderAlias: string, label: string, weight = 0) => ({
    type: 'workspaceActionMenuItem',
    kind: 'previewOption',
    alias,
    weight,
    forWorkspaceActions: 'Umb.WorkspaceAction.Document.SaveAndPreview',
    meta: { label, urlProviderAlias },
  });

  it("offers Umbraco's own option when nothing else is registered", () => {
    expect(previewOptions([option('Umb.Document.WorkspaceActionMenuItem.SaveAndPreview', 'umbDocumentUrlProvider', '#buttons_saveAndPreview', 100)])).to.deep.equal([
      { providerAlias: 'umbDocumentUrlProvider', label: '#buttons_saveAndPreview' },
    ]);
  });

  it('offers every option the site registered for Save and preview, heaviest first', () => {
    const list = previewOptions([
      option('Umb.Document.WorkspaceActionMenuItem.SaveAndPreview', 'umbDocumentUrlProvider', '#buttons_saveAndPreview', 100),
      option('My.Preview.Headless', 'myHeadlessProvider', 'Preview on the front-end', 200),
    ]);
    expect(list.map((o) => o.providerAlias)).to.deep.equal(['myHeadlessProvider', 'umbDocumentUrlProvider']);
  });

  it('ignores menu items that belong to other actions or are not preview options', () => {
    const list = previewOptions([
      { ...option('Other', 'x', 'X'), forWorkspaceActions: 'Umb.WorkspaceAction.Document.Save' },
      { ...option('NotAPreview', 'y', 'Y'), kind: 'default' },
    ]);
    expect(list).to.deep.equal([{ providerAlias: UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER, label: '#buttons_saveAndPreview' }]);
  });

  it('accepts a list of actions as well as a single one', () => {
    const list = previewOptions([
      { ...option('Many', 'many', 'Many'), forWorkspaceActions: ['Umb.WorkspaceAction.Document.SaveAndPreview', 'Other'] },
    ]);
    expect(list.map((o) => o.providerAlias)).to.deep.equal(['many']);
  });
});

describe('previewReloadNeeded', () => {
  it('reloads when the saved version changed', () => {
    expect(previewReloadNeeded({ saves: 1 }, { saves: 2 })).to.equal(true);
  });

  it('reloads when somebody else saved while this window had unsaved changes', () => {
    expect(previewReloadNeeded({ saves: 1, changedElsewhere: false }, { saves: 1, changedElsewhere: true })).to.equal(true);
  });

  it('does not reload for typing, which changes neither', () => {
    expect(previewReloadNeeded({ saves: 1, dirty: false }, { saves: 1, dirty: true })).to.equal(false);
  });

  it('does not reload when an acknowledged conflict is merely still there', () => {
    expect(previewReloadNeeded({ saves: 1, changedElsewhere: true }, { saves: 1, changedElsewhere: true })).to.equal(false);
  });
});

describe('previewRefreshesItself', () => {
  const base = 'https://cms.example.com/umbraco/';

  it("recognises Umbraco's own preview page, which refreshes itself over its preview hub", () => {
    expect(previewRefreshesItself('https://cms.example.com/umbraco/preview?id=abc&rnd=1', base)).to.equal(true);
  });

  it('recognises it under a backoffice path that is not the default', () => {
    expect(previewRefreshesItself('https://cms.example.com/backoffice/preview/?id=abc', 'https://cms.example.com/backoffice/')).to.equal(true);
  });

  it('does not take a headless front-end for it, which the desktop has to reload', () => {
    expect(previewRefreshesItself('https://www.example.com/umbraco/preview?id=abc', base)).to.equal(false);
  });

  it('does not take a page of the site that merely has preview in its path for it', () => {
    expect(previewRefreshesItself('https://cms.example.com/blog/preview', base)).to.equal(false);
    expect(previewRefreshesItself('https://cms.example.com/umbraco/preview-of-things', base)).to.equal(false);
  });
});
