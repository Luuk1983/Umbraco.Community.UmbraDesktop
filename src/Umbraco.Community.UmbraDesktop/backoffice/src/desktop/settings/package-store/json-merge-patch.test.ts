import { expect } from '@open-wc/testing';
import { applyMergePatch, composeMergePatches } from './json-merge-patch.js';

/**
 * JSON Merge Patch, RFC 7386, as the page applies it to show a change at once. The server applies
 * the same rules (`JsonMergePatch.cs`), and the page then takes the server's answer, so the two
 * only have to agree for the moment between a change and its answer.
 */

it('adds a member and keeps the others', () => {
  expect(applyMergePatch({ kept: { a: true } }, { kept: { b: true } })).to.deep.equal({ kept: { a: true, b: true } });
});

it('removes a member set to null', () => {
  expect(applyMergePatch({ kept: { a: true, b: true } }, { kept: { a: null } })).to.deep.equal({ kept: { b: true } });
});

it('replaces an array whole', () => {
  expect(applyMergePatch({ list: [1, 2] }, { list: [3] })).to.deep.equal({ list: [3] });
});

it('treats nothing, or something that is not an object, as an empty object', () => {
  expect(applyMergePatch(undefined, { a: { b: 1 } })).to.deep.equal({ a: { b: 1 } });
  expect(applyMergePatch([1, 2], { a: 1 })).to.deep.equal({ a: 1 });
});

it('leaves no nulls in a new nested object', () => {
  expect(applyMergePatch({}, { a: { b: null, c: 2 } })).to.deep.equal({ a: { c: 2 } });
});

it('changes neither the target nor the patch', () => {
  const target = { a: { b: 1 } };
  const patch = { a: { c: 2 } };
  applyMergePatch(target, patch);
  expect([target, patch]).to.deep.equal([{ a: { b: 1 } }, { a: { c: 2 } }]);
});

it('composes two patches into one that does what both do, in order', () => {
  const target = { kept: { a: true, b: true }, other: 1 };
  const first = { kept: { c: true }, other: null };
  const second = { kept: { a: null, c: false } };
  const composed = composeMergePatches(first, second);
  expect(composed).to.deep.equal({ kept: { c: false, a: null }, other: null });
  expect(applyMergePatch(target, composed)).to.deep.equal(applyMergePatch(applyMergePatch(target, first), second));
});

it('cannot compose a patch that sets an object where the first set something else', () => {
  // The first removes "a"; the second gives it {c: 1}. One patch saying {a: {c: 1}} would merge into
  // whatever "a" was, keeping members the first had removed, so no single patch does both.
  expect(composeMergePatches({ a: null }, { a: { c: 1 } })).to.equal(undefined);
  expect(composeMergePatches({ a: 5 }, { a: { c: 1 } })).to.equal(undefined);
});
