import { expect } from '@open-wc/testing';
import { caretPosition } from './text.js';

it('reports the first line and column for an empty document', () => {
  expect(caretPosition('', 0)).to.deep.equal({ line: 1, column: 1 });
});

it('counts lines and columns from one, the way the status bar shows them', () => {
  expect(caretPosition('hello', 5)).to.deep.equal({ line: 1, column: 6 });
  expect(caretPosition('ab\ncd', 3), 'the start of the second line').to.deep.equal({ line: 2, column: 1 });
  expect(caretPosition('ab\ncd', 5)).to.deep.equal({ line: 2, column: 3 });
});

it('treats a caret beyond the end as at the end', () => {
  expect(caretPosition('ab', 99)).to.deep.equal({ line: 1, column: 3 });
});
