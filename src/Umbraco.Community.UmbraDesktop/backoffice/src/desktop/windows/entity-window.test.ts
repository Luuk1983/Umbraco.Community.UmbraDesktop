import { expect } from '@open-wc/testing';
import {
  entityWindowAlias,
  entityWindowApp,
  findEntityWindow,
  sectionUrlFromHref,
  UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
  UMBRADESKTOP_ENTITY_WINDOW_SIZE,
} from './entity-window';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';

/** A window with only the fields the lookup reads. */
const win = (id: string, alias: string) => ({ id, app: { alias } as UmbraDesktopApp }) as UmbraDesktopWindow;

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('sectionUrlFromHref', () => {
  // Every shape core's search data sources produce (v17), including member type's leading slash.
  for (const [href, url] of [
    [`section/content/workspace/document/edit/${KEY}`, `/umbraco/section/content/workspace/document/edit/${KEY}`],
    [`section/media/workspace/media/edit/${KEY}`, `/umbraco/section/media/workspace/media/edit/${KEY}`],
    [`section/member-management/workspace/member/edit/${KEY}`, `/umbraco/section/member-management/workspace/member/edit/${KEY}`],
    [`section/settings/workspace/data-type/edit/${KEY}`, `/umbraco/section/settings/workspace/data-type/edit/${KEY}`],
    [`section/settings/workspace/document-type/edit/${KEY}`, `/umbraco/section/settings/workspace/document-type/edit/${KEY}`],
    [`section/settings/workspace/media-type/edit/${KEY}`, `/umbraco/section/settings/workspace/media-type/edit/${KEY}`],
    [`/section/settings/workspace/member-type/edit/${KEY}`, `/umbraco/section/settings/workspace/member-type/edit/${KEY}`],
    [`section/settings/workspace/template/edit/${KEY}`, `/umbraco/section/settings/workspace/template/edit/${KEY}`],
    [`section/translation/workspace/dictionary/edit/${KEY}`, `/umbraco/section/translation/workspace/dictionary/edit/${KEY}`],
    [`/umbraco/section/content/workspace/document/edit/${KEY}`, `/umbraco/section/content/workspace/document/edit/${KEY}`],
  ]) {
    it(`maps ${href}`, () => expect(sectionUrlFromHref(href)).to.equal(url));
  }

  it('refuses anything that does not land on a backoffice section', () => {
    for (const href of [undefined, '', 'https://example.com/x', '//example.com/section/x', 'dashboard/x', 'section/../../logout']) {
      expect(sectionUrlFromHref(href), String(href)).to.equal(undefined);
    }
  });
});

describe('entityWindowApp', () => {
  it('builds an editor-only window that is focused rather than duplicated', () => {
    const app = entityWindowApp({ entityType: 'document', unique: KEY, name: 'Home', icon: 'icon-home', url: '/umbraco/section/x' });
    expect(app).to.deep.equal({
      alias: entityWindowAlias('document', KEY),
      name: 'Home',
      icon: 'icon-home',
      content: { kind: 'iframe', url: '/umbraco/section/x' },
      chromeProfile: 'workspace-only',
      defaultSize: UMBRADESKTOP_ENTITY_WINDOW_SIZE,
      minSize: UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
      allowMultiple: false,
    });
  });

  it('gives different entities different aliases, so two results are two windows', () => {
    expect(entityWindowAlias('document', KEY)).to.not.equal(entityWindowAlias('media', KEY));
  });
});

describe('findEntityWindow', () => {
  const desk = (windows: UmbraDesktopWindow[], subjects: Record<string, UmbraDesktopWorkspaceSubject[]> = {}) => ({
    getWindows: () => windows,
    subjectsOf: (id: string) => subjects[id] ?? [],
  });

  it('finds a window by what it shows, such as the Content window on that document', () => {
    const found = findEntityWindow(desk([win('w1', 'content')], { w1: [{ entityType: 'document', unique: KEY } as UmbraDesktopWorkspaceSubject] }), 'document', KEY);
    expect(found).to.equal('w1');
  });

  it('finds a window it opened before that frame reported its subject', () => {
    expect(findEntityWindow(desk([win('w2', entityWindowAlias('document', KEY))]), 'document', KEY)).to.equal('w2');
  });

  it('does not mistake media for a document with the same key', () => {
    expect(findEntityWindow(desk([win('w3', entityWindowAlias('media', KEY))]), 'document', KEY)).to.equal(undefined);
  });
});
