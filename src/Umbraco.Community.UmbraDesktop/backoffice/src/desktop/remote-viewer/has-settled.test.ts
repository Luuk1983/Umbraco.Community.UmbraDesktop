import { expect } from '@open-wc/testing';
import { hasSettled } from './has-settled';

const proxy = 'http://127.0.0.1:5201/umbraco/management/api/v1/umbradesktop/connection-proxy/c1';
const tree = `${proxy}/umbraco/management/api/v1/tree/document/root?skip=0&take=50`;
const REQUIRED = '/tree/document/root';

describe('deciding the frame has finished loading', () => {
  it('is not settled before any request has been made', () => {
    expect(hasSettled([], 5000, 1500, proxy, REQUIRED)).to.equal(false);
  });

  it('is not settled until the proxy has answered the call the first screen needs, however quiet it is', () => {
    // The gap between the backoffice's own files and its first data call is quiet, and so is the gap
    // between its boot calls and the tree, which it asks for only after rendering the section.
    // Reading either as "done" lifted the cover on an empty tree in the real app.
    const entries = [
      { name: 'http://127.0.0.1:5201/umbraco/backoffice/x.js', responseEnd: 100 },
      { name: `${proxy}/umbraco/management/api/v1/language`, responseEnd: 200 },
    ];
    expect(hasSettled(entries, 5000, 1500, proxy, REQUIRED)).to.equal(false);
  });

  it('is not settled while requests are still finishing', () => {
    const entries = [
      { name: tree, responseEnd: 4000 },
      { name: 'http://127.0.0.1:5201/umbraco/backoffice/x.js', responseEnd: 4600 },
    ];
    expect(hasSettled(entries, 5000, 1500, proxy, REQUIRED)).to.equal(false);
  });

  it('is settled once the required call has come back and nothing has finished for the quiet period', () => {
    const entries = [
      { name: tree, responseEnd: 2000 },
      { name: 'http://127.0.0.1:5201/umbraco/backoffice/x.js', responseEnd: 3000 },
    ];
    expect(hasSettled(entries, 5000, 1500, proxy, REQUIRED)).to.equal(true);
  });

  it('does not count the required path when it went somewhere other than the proxy', () => {
    const entries = [{ name: 'http://127.0.0.1:5201/umbraco/management/api/v1/tree/document/root', responseEnd: 100 }];
    expect(hasSettled(entries, 5000, 1500, proxy, REQUIRED)).to.equal(false);
  });
});
