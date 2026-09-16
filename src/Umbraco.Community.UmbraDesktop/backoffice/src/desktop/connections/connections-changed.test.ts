import { expect } from '@open-wc/testing';
import { notifyConnectionsChanged, observeConnectionsChanged } from './connections-changed';

describe('connections changed', () => {
  it('tells a listener that the set of connections has changed', () => {
    let called = 0;
    const stop = observeConnectionsChanged(() => (called += 1));

    notifyConnectionsChanged();

    expect(called).to.equal(1);
    stop();
  });

  it('tells every listener, not just the first', () => {
    // The launcher's condition is one listener today and will not be the only one for long: any
    // later remote app needs the same signal.
    const heard: string[] = [];
    const stopA = observeConnectionsChanged(() => heard.push('a'));
    const stopB = observeConnectionsChanged(() => heard.push('b'));

    notifyConnectionsChanged();

    expect(heard).to.deep.equal(['a', 'b']);
    stopA();
    stopB();
  });

  it('stops telling a listener that has unsubscribed', () => {
    // Conditions are destroyed and rebuilt as the registry re-evaluates. A listener that outlived
    // its condition would keep a dead controller alive and go on asking the server on its behalf.
    let called = 0;
    const stop = observeConnectionsChanged(() => (called += 1));

    stop();
    notifyConnectionsChanged();

    expect(called).to.equal(0);
  });

  it('still tells the others when one listener throws', () => {
    // One app failing to handle the signal must not silently stop every other app from hearing it.
    let reached = false;
    const stopA = observeConnectionsChanged(() => {
      throw new Error('listener blew up');
    });
    const stopB = observeConnectionsChanged(() => (reached = true));

    notifyConnectionsChanged();

    expect(reached).to.equal(true);
    stopA();
    stopB();
  });
});
