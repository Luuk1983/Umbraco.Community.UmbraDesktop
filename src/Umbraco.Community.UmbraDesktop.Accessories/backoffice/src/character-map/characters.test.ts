import { expect } from '@open-wc/testing';
import { altKeystroke, characterBlocks, codeLabel, displayName, findCharacters, glyphOf } from './characters.js';

/**
 * Character Map's rules, without a DOM: what each block holds, how a character is named and labelled
 * in the status bar, and what a search finds.
 */

it('lists every block, each with its characters in code point order', () => {
  const blocks = characterBlocks();
  expect(blocks[0].id).to.equal('basicLatin');
  for (const block of blocks) {
    expect(block.characters.length, block.id).to.be.greaterThan(0);
    const codes = block.characters.map((character) => character.code);
    expect(codes, block.id).to.deep.equal([...codes].sort((a, b) => a - b));
  }
});

/** A control character has no picture and no business in a grid of pictures. */
it('leaves out characters that are not a picture of anything', () => {
  const latin1 = characterBlocks().find((block) => block.id === 'latin1')!;
  expect(latin1.characters[0].code).to.equal(0xa0);
  const all = characterBlocks().flatMap((block) => block.characters.map((character) => character.code));
  expect(all).to.not.include(0x7f);
});

it('writes a name the way Windows did, in title case', () => {
  expect(displayName('LATIN SMALL LETTER E WITH ACUTE')).to.equal('Latin Small Letter E With Acute');
  expect(displayName('EURO SIGN')).to.equal('Euro Sign');
});

it('labels a code point as U+ and at least four hex digits', () => {
  expect([codeLabel(0xe9), codeLabel(0x20ac), codeLabel(0x1f600)]).to.deep.equal(['U+00E9', 'U+20AC', 'U+1F600']);
});

/** Windows' own keystroke, from the ANSI code page, so the euro is 0128 and not 8364. */
it('gives the Windows Alt keystroke where there is one', () => {
  expect([altKeystroke(0xe9), altKeystroke(0x20ac), altKeystroke(0x2014), altKeystroke(0x41), altKeystroke(0x2192)]).to.deep.equal([
    'Alt+0233',
    'Alt+0128',
    'Alt+0151',
    undefined,
    undefined,
  ]);
});

/** A combining accent draws on the character before it; alone it needs something to sit on. */
it('draws a combining mark on a dotted circle, and anything else as itself', () => {
  const find = (code: number) =>
    characterBlocks()
      .flatMap((block) => block.characters)
      .find((character) => character.code === code)!;
  expect(glyphOf(find(0xe9))).to.equal('é');
  expect(find(0x0483).combining).to.equal(true);
  expect(glyphOf(find(0x0483))).to.equal('◌҃');
});

describe('searching', () => {
  const codes = (query: string) => findCharacters(query).map((character) => character.code);

  it('finds by every word of the name, in any order', () => {
    expect(codes('acute e small')).to.include(0xe9);
    expect(codes('acute e small')).to.not.include(0xc9);
  });

  it('ignores case and the spaces round a query', () => {
    expect(codes('  EURO ')).to.include(0x20ac);
  });

  it('finds by code point, written as U+ or bare hex', () => {
    expect(codes('U+20AC')[0]).to.equal(0x20ac);
    expect(codes('2192')[0]).to.equal(0x2192);
  });

  it('finds a character pasted in', () => {
    expect(codes('→')).to.deep.equal([0x2192]);
  });

  it('finds nothing for nothing', () => {
    expect(codes('   ')).to.deep.equal([]);
    expect(codes('no such character anywhere')).to.deep.equal([]);
  });
});
