import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_BESIDE_OPEN_WIDTH,
  besideAppAlias,
  besideContentIds,
  besideViewFor,
  createBesideApp,
  isBesideAppAlias,
  mergeNotBeside,
} from './beside-model';
import type { UmbraDesktopBesideView } from './beside-model';
import type { UmbraDesktopWindow } from '../types';

/**
 * Rules 1 to 5 of the offer (design §6), pure: the setting, a document owner, the route's view
 * matched to the view on screen, editors left out by kind, and the two opt-out lists. Rule 6 reads
 * the rendered view and is tested in `frame-views.test.ts`.
 */

const GUID = 'ca4249ed-2b23-4337-b522-63cabe5587d1';
const DOCUMENT = `/umbraco/section/content/workspace/document/edit/${GUID}/en-US`;

/** Core's Info view, as its manifest reads. */
const INFO: UmbraDesktopBesideView = {
  type: 'workspaceView',
  alias: 'Umb.WorkspaceView.Document.Info',
  name: 'Document Workspace Info View',
  meta: { label: '#general_info', pathname: 'info', icon: 'icon-info' },
};

/** The rule's input with everything allowing the offer, so each case changes one thing. */
function offer(over: Partial<Parameters<typeof besideViewFor>[0]> = {}) {
  return besideViewFor({ enabled: true, pathname: `${DOCUMENT}/view/info`, view: INFO, notBeside: new Set(), ...over });
}

describe('which view is offered beside the editor', () => {
  it('offers the view on screen when every rule holds', () => {
    expect(offer()).to.equal(INFO);
  });

  it('offers nothing with the setting off', () => {
    expect(offer({ enabled: false })).to.equal(undefined);
  });

  it('offers nothing in a window that is not editing a document', () => {
    expect(offer({ pathname: `/umbraco/section/media/workspace/media/edit/${GUID}/view/info` })).to.equal(undefined);
    expect(offer({ pathname: '/umbraco/section/content/dashboard' })).to.equal(undefined);
  });

  it('offers nothing while the route names no view, which is the first view, the editor', () => {
    expect(offer({ pathname: DOCUMENT })).to.equal(undefined);
  });

  it('offers nothing while the view on screen is not the one the route names yet', () => {
    // A tab click changes the route before the router has rendered the new view, and offering the
    // old view under the new route's name would open the wrong thing.
    expect(offer({ pathname: `${DOCUMENT}/view/history` })).to.equal(undefined);
    expect(offer({ view: undefined })).to.equal(undefined);
  });

  it('leaves out every editor kind, core’s and the ones packages use', () => {
    for (const kind of ['contentEditor', 'contentTypeDesignEditor', 'collection', 'contentCollection', 'tree']) {
      expect(offer({ view: { ...INFO, kind } }), kind).to.equal(undefined);
    }
  });

  it('leaves out a view on either opt-out list', () => {
    expect(offer({ notBeside: new Set([INFO.alias]) })).to.equal(undefined);
  });

  it('reads a manifest with no meta, as any package can register, without throwing', () => {
    expect(offer({ view: { type: 'workspaceView', alias: 'Pkg.View' } as UmbraDesktopBesideView })).to.equal(undefined);
  });
});

describe('the opt-out lists', () => {
  it('add up: the desktop’s and every package’s', () => {
    const merged = mergeNotBeside(['Umb.A'], [{ workspaceViewsNotBeside: ['Pkg.B'] }, {}, { workspaceViewsNotBeside: ['Pkg.C', 'Umb.A'] }]);
    expect([...merged].sort()).to.deep.equal(['Pkg.B', 'Pkg.C', 'Umb.A']);
  });
});

describe('the app a view opens beside the editor in', () => {
  it('is an element app of one kind per view, so each view opens once per window', () => {
    const app = createBesideApp('owner-1', INFO, 'Info: Home');
    expect(app.alias).to.equal(besideAppAlias(INFO.alias));
    expect(besideAppAlias('Umb.WorkspaceView.Document.Info')).to.not.equal(besideAppAlias('Engage.WorkspaceView.AbTesting'));
    expect(app.name).to.equal('Info: Home');
    expect(app.icon).to.equal('icon-info');
    expect(app.content.kind).to.equal('element');
    expect(app.content.kind === 'element' && app.content.props).to.deep.equal({ ownerId: 'owner-1', viewAlias: INFO.alias });
  });

  it('opens at the width Info needs for its two columns', () => {
    expect(UMBRADESKTOP_BESIDE_OPEN_WIDTH).to.equal(920);
    expect(createBesideApp('owner-1', INFO, 'Info').defaultSize?.w).to.equal(UMBRADESKTOP_BESIDE_OPEN_WIDTH);
  });

  it('falls back to a generic icon for a view that names none', () => {
    expect(createBesideApp('owner-1', { ...INFO, meta: { pathname: 'x' } }, 'X').icon).to.be.a('string').and.not.equal('');
  });

  it('is told apart from every other kind of attached content', () => {
    expect(isBesideAppAlias(besideAppAlias(INFO.alias))).to.equal(true);
    expect(isBesideAppAlias('umbradesktop.preview')).to.equal(false);
  });
});

describe('the views open beside a window', () => {
  /** A window as the manager holds it, reduced to what the lookup reads. */
  const win = (over: Partial<UmbraDesktopWindow>) => over as UmbraDesktopWindow;

  it('are its view panes and its floating view windows, and nothing else', () => {
    const windows = [
      win({
        id: 'owner',
        panes: [
          { id: 'p1', app: { alias: besideAppAlias('A') } },
          { id: 'p2', app: { alias: 'umbradesktop.preview' } },
        ] as unknown as UmbraDesktopWindow['panes'],
      }),
      win({ id: 'f1', owner: 'owner', app: { alias: besideAppAlias('B') } as UmbraDesktopWindow['app'] }),
      win({ id: 'f2', owner: 'other', app: { alias: besideAppAlias('B') } as UmbraDesktopWindow['app'] }),
      win({ id: 'f3', owner: 'owner', app: { alias: 'umbradesktop.preview' } as UmbraDesktopWindow['app'] }),
    ];
    expect(besideContentIds(windows, 'owner')).to.deep.equal(['p1', 'f1']);
  });
});
