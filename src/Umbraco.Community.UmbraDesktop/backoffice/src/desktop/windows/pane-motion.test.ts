import { expect } from '@open-wc/testing';
import { liftMotion, paneMotion, rememberLift, takeLift } from './pane-motion.js';

/**
 * The geometry of a pane sliding in and out, and of a popped-out pane lifting off. Pure, so each
 * case is pinned without a window: the two kinds of slide, their mirror on the left, and the lift.
 * Design: `docs/design/2026-10-27-pane-side-panel-design.md`.
 */

describe('a pane sliding in', () => {
  it('comes out from under the editor while a window that grew moves its edge out', () => {
    const motion = paneMotion({ side: 'right', grew: 325, span: 325, rect: { x: 100, w: 1025 } });
    expect(motion.frame, 'the frame grows from its old width').to.deep.equal([
      { left: '100px', width: '700px', minWidth: '0px' },
      { left: '100px', width: '1025px', minWidth: '0px' },
    ]);
    expect(motion.pane, 'the pane rides the edge, starting tucked under the editor').to.deep.equal([
      { transform: 'translateX(-325px)' },
      { transform: 'translateX(0px)' },
    ]);
    expect(motion.overlap, 'the editor keeps its width over the whole slide').to.equal(0);
    expect(motion.under, 'drawn under the editor, which it comes out from').to.equal(true);
  });

  it('slides in over the editor in a window that could not grow, and moves no edge', () => {
    const motion = paneMotion({ side: 'right', grew: 0, span: 325, rect: { x: 0, w: 1600 } });
    expect(motion.frame).to.equal(undefined);
    expect(motion.pane).to.deep.equal([{ transform: 'translateX(325px)' }, { transform: 'translateX(0px)' }]);
    expect(motion.overlap, 'the editor stays full width under it until it lands').to.equal(325);
    expect(motion.under).to.equal(false);
  });

  it('lets the editor reach under the pane by what the window could not grow by', () => {
    const motion = paneMotion({ side: 'right', grew: 200, span: 325, rect: { x: 100, w: 1025 } });
    expect(motion.overlap).to.equal(125);
    expect(motion.pane[0]).to.deep.equal({ transform: 'translateX(-200px)' });
  });

  it('mirrors on the left: the frame grows leftwards and the pane comes out the other way', () => {
    const motion = paneMotion({ side: 'left', grew: 325, span: 325, rect: { x: 100, w: 1025 } });
    expect(motion.frame).to.deep.equal([
      { left: '425px', width: '700px', minWidth: '0px' },
      { left: '100px', width: '1025px', minWidth: '0px' },
    ]);
    expect(motion.pane[0]).to.deep.equal({ transform: 'translateX(325px)' });
    const over = paneMotion({ side: 'left', grew: 0, span: 325, rect: { x: 0, w: 1600 } });
    expect(over.pane[0]).to.deep.equal({ transform: 'translateX(-325px)' });
  });
});

describe('a popped-out pane lifting off', () => {
  it('starts where the pane was and settles where the window is', () => {
    expect(liftMotion({ x: 800, y: 90 }, { x: 640, y: 130 })).to.deep.equal([
      { transform: 'translate(160px, -40px)' },
      { transform: 'translate(0px, 0px)' },
    ]);
  });

  it('hands a remembered spot over once, to the window that pops out under that id', () => {
    rememberLift('pane-1', { x: 10, y: 20 });
    expect(takeLift('pane-1')).to.deep.equal({ x: 10, y: 20 });
    expect(takeLift('pane-1'), 'a window that opens again later does not lift').to.equal(undefined);
  });
});
