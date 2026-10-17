import { expect } from '@open-wc/testing';
import { markFromObject, markToObject } from './marks.js';
import type { Mark } from './state.js';

/**
 * Marks are plain data in the document and Fabric objects on the canvas. The two must round-trip
 * exactly, and they live in oriented space, so the crop's offset is taken off going in and put back
 * coming out: a crop never moves a mark (plan Task 18).
 */

/** One of each kind of mark. */
const MARKS: Mark[] = [
  { id: 'a', kind: 'arrow', colour: '#d42054', width: 5, data: { from: { x: 10, y: 20 }, to: { x: 110, y: 70 } } },
  { id: 'b', kind: 'box', colour: '#2bc37c', width: 4, data: { x: 30, y: 40, w: 120, h: 60 } },
  { id: 'p', kind: 'pen', colour: '#3544b1', width: 3, data: { points: [{ x: 5, y: 5 }, { x: 25, y: 15 }, { x: 45, y: 5 }] } },
  { id: 't', kind: 'text', colour: '#1b264f', width: 2, data: { at: { x: 50, y: 60 }, text: 'Look here', size: 32 } },
];

/** Numbers equal to a hundredth, through any nesting. */
function near(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(actual as number, path).to.be.closeTo(expected, 0.01);
    return;
  }
  if (expected && typeof expected === 'object') {
    for (const key of Object.keys(expected)) near((actual as never)[key], (expected as never)[key], `${path}.${key}`);
    return;
  }
  expect(actual, path).to.equal(expected);
}

for (const mark of MARKS) {
  it(`round-trips a ${mark.kind} mark unchanged`, () => {
    near(markFromObject(markToObject(mark, { x: 0, y: 0 }), { x: 0, y: 0 }), mark);
  });

  it(`puts a ${mark.kind} mark back where it was in a cropped view`, () => {
    const offset = { x: 20, y: 10 };
    near(markFromObject(markToObject(mark, offset), offset), mark);
  });
}

/**
 * Fabric measures an object from the outside of its stroke, where the saved file strokes a box on
 * its edge, so the object sits half a stroke out from the mark's own corner.
 */
it('places a mark at its position less the crop offset', () => {
  const box = markToObject(MARKS[1], { x: 20, y: 10 });
  expect(box.left).to.equal(10 - MARKS[1].width / 2);
  expect(box.top).to.equal(30 - MARKS[1].width / 2);
});

it('moves a dragged arrow with the drag', () => {
  const object = markToObject(MARKS[0], { x: 0, y: 0 });
  object.set({ left: object.left + 15, top: object.top + 5 });
  object.setCoords();
  const moved = markFromObject(object, { x: 0, y: 0 }) as Extract<Mark, { kind: 'arrow' }>;
  near(moved.data.from, { x: 25, y: 25 });
  near(moved.data.to, { x: 125, y: 75 });
});

it('grows a scaled box and a scaled text', () => {
  const box = markToObject(MARKS[1], { x: 0, y: 0 });
  box.set({ scaleX: 2, scaleY: 0.5 });
  near((markFromObject(box, { x: 0, y: 0 }) as Extract<Mark, { kind: 'box' }>).data, { x: 30, y: 40, w: 240, h: 30 });
  const text = markToObject(MARKS[3], { x: 0, y: 0 });
  text.set({ scaleX: 1.5, scaleY: 1.5 });
  expect((markFromObject(text, { x: 0, y: 0 }) as Extract<Mark, { kind: 'text' }>).data.size).to.be.closeTo(48, 0.01);
});
