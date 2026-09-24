import { expect } from '@open-wc/testing';
import { caretPosition, textFileName } from './text.js';

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

/**
 * The name a download is saved under. A file that was opened keeps its own name, so saving it back
 * is a round trip rather than a copy called "Untitled". A name the user gave without an extension
 * gets `.txt`, since a file with none opens in nothing on half the machines it lands on.
 */
it('names the saved file after the document', () => {
  expect(textFileName(undefined, 'Untitled')).to.equal('Untitled.txt');
  expect(textFileName('notes.txt', 'Untitled')).to.equal('notes.txt');
  expect(textFileName('robots', 'Untitled')).to.equal('robots.txt');
  expect(textFileName('site.webmanifest', 'Untitled'), 'an extension of its own is kept').to.equal(
    'site.webmanifest',
  );
});
