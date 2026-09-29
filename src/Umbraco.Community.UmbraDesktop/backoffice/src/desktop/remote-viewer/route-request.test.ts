import { expect } from '@open-wc/testing';
import { routeRequest } from './route-request';

const origin = 'http://127.0.0.1:5201';
const url = (path: string) => new URL(path, origin);

describe('remote viewer request routing', () => {
  describe('what stays on the local instance', () => {
    const local = [
      // The iframe is genuinely logged in through the local session, so auth is never redirected.
      '/umbraco/management/api/v1/security/back-office/token',
      '/umbraco/management/api/v1/security/back-office/authorize',
      // The registry has to stay the local one, or a missing editor could not be told apart.
      '/umbraco/management/api/v1/manifest/manifest/private',
      '/umbraco/management/api/v1/manifest/manifest/public',
      // The desktop's own controllers live under the management API and exist nowhere else.
      '/umbraco/management/api/v1/umbradesktop/connections',
      // Asked before the frame has logged in, so they cannot go through the proxy, which needs a
      // login; and they describe the frame's own runtime, not the remote's content.
      '/umbraco/management/api/v1/server/status',
      '/umbraco/management/api/v1/server/configuration',
      '/umbraco/management/api/v1/install/settings',
      '/umbraco/management/api/v1/upgrade/settings',
      // Static files of the backoffice bundle itself.
      '/umbraco/backoffice/css/umb-css.css',
      '/App_Plugins/Umbraco.Community.UmbraDesktop/bundle.manifests.js',
    ];
    for (const path of local) {
      it(`keeps ${path} local`, () => {
        expect(routeRequest('GET', url(path), origin).target).to.equal('local');
      });
    }
  });

  describe('what goes to the remote', () => {
    const remote = [
      '/umbraco/management/api/v1/tree/document/root',
      '/umbraco/management/api/v1/document/3a2f0c10-0000-0000-0000-000000000000',
      '/umbraco/management/api/v1/document-type/3a2f0c10-0000-0000-0000-000000000000',
      '/umbraco/management/api/v1/data-type/3a2f0c10-0000-0000-0000-000000000000',
      '/umbraco/management/api/v1/language',
      // Which version the remote runs is about the remote, unlike its status and configuration.
      '/umbraco/management/api/v1/server/information',
      // The current user is the remote's API user, on purpose: its start nodes, languages and
      // sections are the remote's, and a local user's would point at keys that do not exist there.
      // Read-only does not depend on it; frame-read-only.ts enforces that whatever the user may do.
      '/umbraco/management/api/v1/user/current',
      '/umbraco/management/api/v1/user/current/permissions/document',
      '/media/abcd1234/photo.jpg',
    ];
    for (const path of remote) {
      it(`sends ${path} to the remote unchanged`, () => {
        const route = routeRequest('GET', url(path), origin);
        expect(route.target).to.equal('remote');
        if (route.target === 'remote') expect(route.path).to.equal(path);
      });
    }

    it('keeps the query string', () => {
      const route = routeRequest('GET', url('/umbraco/management/api/v1/tree/document/children?parent=x&skip=0&take=100'), origin);
      expect(route.target).to.equal('remote');
      if (route.target === 'remote') {
        expect(route.path).to.equal('/umbraco/management/api/v1/tree/document/children?parent=x&skip=0&take=100');
      }
    });

    it('treats an unknown management API path as remote, because the default is what makes it generic', () => {
      expect(routeRequest('GET', url('/umbraco/management/api/v1/some-package/things'), origin).target).to.equal('remote');
    });
  });

  describe('what is refused', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      it(`refuses ${method} to the remote`, () => {
        const route = routeRequest(method, url('/umbraco/management/api/v1/document/x'), origin);
        expect(route.target).to.equal('blocked');
      });
    }

    it('still lets a write to a local path through, because that is the local instance', () => {
      expect(routeRequest('POST', url('/umbraco/management/api/v1/security/back-office/token'), origin).target).to.equal('local');
    });

    it('is case-insensitive about the method', () => {
      expect(routeRequest('get', url('/umbraco/management/api/v1/language'), origin).target).to.equal('remote');
    });
  });

  describe("this instance's live channels", () => {
    // The frame is this instance's backoffice, so its SignalR connections go to this instance and
    // hear about this instance's changes. Keys are GUIDs and two sites can share them (two copies of
    // the Starter Kit do), so "Home was saved" here would be taken as news about the remote's Home.
    // No live channel is better than one about the wrong site.
    const hubs = [
      '/umbraco/serverEventHub/negotiate?negotiateVersion=1',
      '/umbraco/serverEventHub',
      '/umbraco/serverEventHub?id=abc',
      '/umbraco/PreviewHub/negotiate?negotiateVersion=1',
      '/umbraco/backofficeHub/negotiate?negotiateVersion=1',
    ];
    for (const path of hubs) {
      it(`blocks ${path}, even as a GET or POST`, () => {
        expect(routeRequest('GET', url(path), origin).target).to.equal('blocked');
        expect(routeRequest('POST', url(path), origin).target).to.equal('blocked');
      });
    }

    it('blocks a hub by path whatever its case, as ASP.NET routes it', () => {
      expect(routeRequest('POST', url('/umbraco/servereventhub/negotiate'), origin).target).to.equal('blocked');
    });

    it("blocks any package's SignalR hub, recognised by its negotiate call", () => {
      expect(routeRequest('POST', url('/umbraco/somepackage/hub/negotiate?negotiateVersion=1'), origin).target).to.equal('blocked');
    });

    it('leaves a path that only happens to end in negotiate alone', () => {
      expect(routeRequest('GET', url('/umbraco/management/api/v1/some-package/negotiate'), origin).target).to.equal('remote');
    });
  });

  it('leaves a request to another origin alone', () => {
    const route = routeRequest('GET', new URL('https://cdn.example.com/umbraco/management/api/v1/language'), origin);
    expect(route.target).to.equal('local');
  });
});
