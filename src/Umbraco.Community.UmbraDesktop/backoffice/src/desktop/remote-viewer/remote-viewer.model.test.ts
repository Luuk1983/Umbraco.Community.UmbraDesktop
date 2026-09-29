import { expect } from '@open-wc/testing';
import { chooseConnection, compareVersions, proxyBaseFor, remoteOriginOf } from './remote-viewer.model';

describe('remote viewer: the proxy address', () => {
  it('is the connection proxy on this origin, under the area the frame keeps local', () => {
    expect(proxyBaseFor('http://127.0.0.1:5201', 'abc')).to.equal(
      'http://127.0.0.1:5201/umbraco/management/api/v1/umbradesktop/connection-proxy/abc',
    );
  });
});

describe('remote viewer: the remote origin', () => {
  it('is the origin of the connection address, whatever path or slash it was stored with', () => {
    expect(remoteOriginOf('https://www.example.com')).to.equal('https://www.example.com');
    expect(remoteOriginOf('https://www.example.com/')).to.equal('https://www.example.com');
    expect(remoteOriginOf(' https://www.example.com:8443/umbraco ')).to.equal('https://www.example.com:8443');
  });

  it('is nothing for an address that does not parse', () => {
    expect(remoteOriginOf('not an address')).to.equal(undefined);
    expect(remoteOriginOf('https://localhost:123456')).to.equal(undefined);
  });
});

describe('remote viewer: which connection opens', () => {
  const ids = ['a', 'b', 'c'];

  it('opens the one chosen last time', () => {
    expect(chooseConnection(ids, 'b')).to.equal('b');
  });

  it('falls back to the first when the remembered one is gone', () => {
    expect(chooseConnection(ids, 'removed')).to.equal('a');
    expect(chooseConnection(ids, undefined)).to.equal('a');
  });

  it('is nothing when there are no connections', () => {
    expect(chooseConnection([], 'a')).to.equal(undefined);
  });
});

describe('remote viewer: comparing versions', () => {
  it('counts the same major and minor as the same, whatever the patch or pre-release', () => {
    expect(compareVersions('17.2.1', '17.2.0')).to.equal('same');
    expect(compareVersions('17.2.0', '17.2.0-rc.1')).to.equal('same');
  });

  it('counts a different minor or major as different, because editors and API models can differ', () => {
    expect(compareVersions('17.2.0', '17.3.0')).to.equal('different');
    expect(compareVersions('17.2.0', '16.4.0')).to.equal('different');
  });

  it('says it cannot tell when either side did not report one', () => {
    expect(compareVersions('17.2.0', undefined)).to.equal('unknown');
    expect(compareVersions(null, '17.2.0')).to.equal('unknown');
    expect(compareVersions('17.2.0', 'garbage')).to.equal('unknown');
  });
});
