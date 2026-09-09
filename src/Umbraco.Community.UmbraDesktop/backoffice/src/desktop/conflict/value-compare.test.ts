import { expect } from '@open-wc/testing';
import { sameEditableContent } from './value-compare.js';

/**
 * The comparison that decides whether a server event was this window's own write. It runs over the
 * parts of a content model an editor can actually write, because the server's copy carries fields
 * the editor never had: `updateDate` and `state` change on every save, so a literal deep comparison
 * would find a window's own save unequal to itself and raise a data-loss alarm on it. See design
 * §5.3 and R1.
 */

/** A document detail model as the workspace holds it, with only the fields this module reads. */
function doc(over: Record<string, unknown> = {}) {
  return {
    unique: 'a1',
    documentType: { unique: 'dt1' },
    template: null,
    isTrashed: false,
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
    variants: [
      { culture: 'en-US', segment: null, name: 'Home', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
    ],
    ...over,
  };
}

it('calls a model the same as itself', () => {
  expect(sameEditableContent(doc(), doc())).to.equal(true);
});

it('ignores the server-managed fields a save comes back with', () => {
  // The single most important case in this file: this is a window's own save returning from the
  // server, and treating it as a difference is what flashes a false alarm on every save.
  const theirs = doc({
    variants: [
      { culture: 'en-US', segment: null, name: 'Home', createDate: '2026-01-01', updateDate: '2026-09-08T11:22:33Z', state: 'Published', publishDate: '2026-09-08T11:22:33Z' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-09-08T11:22:33Z', state: 'Draft' },
    ],
    isTrashed: true,
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('sees a changed property value', () => {
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome to Acme', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a change in a culture other than the one being edited', () => {
  // Design §6: this is the case Umbraco's save silently reverts, so it must never compare equal.
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen bei Acme Ltd', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('treats culture and segment as part of a value identity', () => {
  const theirs = doc({
    values: [
      { alias: 'title', culture: 'en-US', segment: 'mobile', value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a renamed variant', () => {
  const theirs = doc({
    variants: [
      { culture: 'en-US', segment: null, name: 'Homepage', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
      { culture: 'de-DE', segment: null, name: 'Startseite', createDate: '2026-01-01', updateDate: '2026-01-01', state: 'Draft' },
    ],
  });
  expect(sameEditableContent(doc(), theirs)).to.equal(false);
});

it('sees a changed template', () => {
  expect(sameEditableContent(doc(), doc({ template: { unique: 't2' } }))).to.equal(false);
});

it('does not care what order the server returns values in', () => {
  const theirs = doc({ values: [...doc().values].reverse() });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('does not care what order the server returns variants in', () => {
  // The values array has the same test above. Variants need their own, because they carry the
  // editor-visible name: a lost sort here would report a document as changed by somebody else on
  // nothing more than the order two cultures came back in.
  const theirs = doc({ variants: [...doc().variants].reverse() });
  expect(sameEditableContent(doc(), theirs)).to.equal(true);
});

it('compares a model with no values or variants field by stripping known server keys', () => {
  // A data type or member type workspace: not content-shaped, still comparable.
  const mine = { unique: 'x', name: 'My type', updateDate: '2026-01-01' };
  const theirs = { unique: 'x', name: 'My type', updateDate: '2026-09-08' };
  expect(sameEditableContent(mine, theirs)).to.equal(true);
  expect(sameEditableContent(mine, { ...theirs, name: 'Renamed' })).to.equal(false);
});

it('answers false when either side is missing, because equality is unknowable', () => {
  expect(sameEditableContent(undefined, doc())).to.equal(false);
  expect(sameEditableContent(doc(), undefined)).to.equal(false);
});
