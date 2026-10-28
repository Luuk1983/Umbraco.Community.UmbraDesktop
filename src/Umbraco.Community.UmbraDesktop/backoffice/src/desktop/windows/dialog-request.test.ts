import { expect } from '@open-wc/testing';
import { dialogApp } from './dialog-request';

/** A stand-in for a dialog's content. */
class ProbeElement extends HTMLElement {}

describe('dialogApp', () => {
  it('turns an app request into a dialog app of that window', () => {
    const app = dialogApp('w1', { name: 'Ask', icon: 'icon-alert', element: ProbeElement, props: { a: 1 }, size: { w: 600, h: 400 } });
    expect(app?.alias).to.equal('umbradesktop-dialog:w1');
    expect(app?.name).to.equal('Ask');
    expect(app?.icon).to.equal('icon-alert');
    expect(app?.defaultSize).to.deep.equal({ w: 600, h: 400 });
    expect(app?.resizable).to.equal(false);
    expect(app?.content.kind === 'element' && app.content.element).to.equal(ProbeElement);
    expect(app?.content.kind === 'element' && app.content.props).to.deep.equal({ a: 1 });
  });

  it('gives an icon when none is asked for', () => {
    expect(dialogApp('w1', { name: 'Ask', element: ProbeElement, size: { w: 600, h: 400 } })?.icon).to.equal('icon-alert');
  });

  it('reads nothing without content, a name or a usable size', () => {
    expect(dialogApp('w1', undefined) === undefined).to.equal(true);
    expect(dialogApp('w1', { name: 'Ask', size: { w: 600, h: 400 } }) === undefined).to.equal(true);
    expect(dialogApp('w1', { element: ProbeElement, size: { w: 600, h: 400 } }) === undefined).to.equal(true);
    expect(dialogApp('w1', { name: 'Ask', element: ProbeElement, size: { w: 0, h: 400 } }) === undefined).to.equal(true);
    expect(dialogApp('w1', { name: 'Ask', element: ProbeElement }) === undefined).to.equal(true);
  });
});
