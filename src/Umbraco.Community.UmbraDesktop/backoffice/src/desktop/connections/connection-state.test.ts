import { expect } from '@open-wc/testing';
import { connectionStateLabel, connectionStateTone, isConnectionUsable } from './connection-state';

describe('connection state', () => {
  it('labels every status the server can report', () => {
    // The five the C# enum defines. A status arriving here without a label would render as its raw
    // token, which is the failure this list exists to prevent.
    expect(connectionStateLabel('Ok')).to.equal('umbraDesktop_connectionStateOk');
    expect(connectionStateLabel('Unreachable')).to.equal('umbraDesktop_connectionStateUnreachable');
    expect(connectionStateLabel('InvalidCredentials')).to.equal(
      'umbraDesktop_connectionStateInvalidCredentials',
    );
    expect(connectionStateLabel('Forbidden')).to.equal('umbraDesktop_connectionStateForbidden');
    expect(connectionStateLabel('NotConfigured')).to.equal('umbraDesktop_connectionStateNotConfigured');
  });

  it('falls back to unknown for a status it has never heard of', () => {
    // A connected instance may be running a newer package than this one. An unrecognised status is
    // then somebody else's new feature, not a bug here, and it must not render as a blank cell.
    expect(connectionStateLabel('SomethingNewer')).to.equal('umbraDesktop_connectionStatusUnknown');
  });

  it('tells the three kinds of failure apart by tone', () => {
    // The whole point of keeping them separate on the server is lost if they all read the same
    // colour here. Unreachable is the site being down; the other two are configuration.
    expect(connectionStateTone('Ok')).to.equal('positive');
    expect(connectionStateTone('Unreachable')).to.equal('danger');
    expect(connectionStateTone('InvalidCredentials')).to.equal('warning');
    expect(connectionStateTone('Forbidden')).to.equal('warning');
    expect(connectionStateTone('NotConfigured')).to.equal('warning');
  });

  it('treats an unknown status as a warning rather than as working', () => {
    expect(connectionStateTone('SomethingNewer')).to.equal('warning');
  });

  it('says a connection is usable only when it is Ok', () => {
    expect(isConnectionUsable('Ok')).to.equal(true);
    expect(isConnectionUsable('Unreachable')).to.equal(false);
    expect(isConnectionUsable('NotConfigured')).to.equal(false);
  });
});
