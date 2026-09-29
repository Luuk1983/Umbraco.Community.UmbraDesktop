import { expect } from '@open-wc/testing';
import { findEscapedRequests, findFailedProxyCalls } from './find-escaped-requests';

const origin = 'http://127.0.0.1:5201';

describe('finding requests that beat the shim', () => {
  it('reports a data call to the local instance that started before the shim was installed', () => {
    const entries = [{ name: `${origin}/umbraco/management/api/v1/tree/document/root`, startTime: 5 }];
    expect(findEscapedRequests(entries, 10, origin)).to.deep.equal([entries[0].name]);
  });

  it("reports a call to this instance's event hub that started before the shim, which would have been refused", () => {
    const entries = [{ name: `${origin}/umbraco/serverEventHub/negotiate?negotiateVersion=1`, startTime: 5 }];
    expect(findEscapedRequests(entries, 10, origin)).to.deep.equal([entries[0].name]);
  });

  it('ignores a data call that started after the shim, which would have been redirected', () => {
    const entries = [{ name: `${origin}/umbraco/management/api/v1/tree/document/root`, startTime: 20 }];
    expect(findEscapedRequests(entries, 10, origin)).to.deep.equal([]);
  });

  it('ignores calls that were meant to stay local', () => {
    const entries = [
      { name: `${origin}/umbraco/management/api/v1/security/back-office/token`, startTime: 1 },
      { name: `${origin}/umbraco/management/api/v1/manifest/manifest/private`, startTime: 1 },
      { name: `${origin}/umbraco/backoffice/css/umb-css.css`, startTime: 1 },
    ];
    expect(findEscapedRequests(entries, 10, origin)).to.deep.equal([]);
  });

  it('ignores requests to the proxy', () => {
    const entries = [{ name: 'http://127.0.0.1:5300/remote/spike/umbraco/management/api/v1/language', startTime: 1 }];
    expect(findEscapedRequests(entries, 10, origin)).to.deep.equal([]);
  });

  it('ignores an entry whose name is not a URL', () => {
    expect(findEscapedRequests([{ name: 'not a url', startTime: 1 }], 10, origin)).to.deep.equal([]);
  });
});

describe('finding proxied calls that failed', () => {
  const proxy = `${origin}/umbraco/management/api/v1/umbradesktop/connection-proxy/c1`;

  it('reports a proxied call refused or broken, which means the frame is not showing the remote', () => {
    const entries = [
      { name: `${proxy}/umbraco/management/api/v1/tree/document/root`, responseStatus: 401 },
      { name: `${proxy}/umbraco/management/api/v1/language`, responseStatus: 502 },
      { name: `${proxy}/umbraco/management/api/v1/user/current`, responseStatus: 403 },
    ];
    expect(findFailedProxyCalls(entries, proxy)).to.deep.equal([
      '401 /umbraco/management/api/v1/tree/document/root',
      '502 /umbraco/management/api/v1/language',
      '403 /umbraco/management/api/v1/user/current',
    ]);
  });

  it('ignores a 404, which the backoffice asks for and handles in the ordinary course of things', () => {
    const entries = [{ name: `${proxy}/umbraco/management/api/v1/document/x/permissions`, responseStatus: 404 }];
    expect(findFailedProxyCalls(entries, proxy)).to.deep.equal([]);
  });

  it('ignores calls that succeeded, and calls not to the proxy', () => {
    const entries = [
      { name: `${proxy}/umbraco/management/api/v1/language`, responseStatus: 200 },
      { name: `${origin}/umbraco/management/api/v1/security/back-office/token`, responseStatus: 401 },
    ];
    expect(findFailedProxyCalls(entries, proxy)).to.deep.equal([]);
  });

  it('ignores an entry the browser recorded no status for, rather than guessing', () => {
    expect(findFailedProxyCalls([{ name: `${proxy}/x`, responseStatus: 0 }], proxy)).to.deep.equal([]);
  });
});
