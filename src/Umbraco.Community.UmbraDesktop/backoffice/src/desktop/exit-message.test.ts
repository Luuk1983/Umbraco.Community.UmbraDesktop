import { expect } from '@open-wc/testing';
import { exitDialogContent } from './exit-message';
import en from './localization/en';

/** A stand-in localizer: renders the real English term with `%0%` filled in. */
function term(key: string, ...args: unknown[]): string {
  const terms = (en as Record<string, Record<string, string>>).umbraDesktop;
  const value = terms[key.replace(/^umbraDesktop_/, '')] ?? key;
  return value.replace('%0%', String(args[0] ?? ''));
}

it('says nothing about unsaved work when there is none', () => {
  const content = exitDialogContent(0, term);
  expect(content).to.equal(term('umbraDesktop_exitQuestion'));
});

it('states how many windows have unsaved changes', () => {
  // The count is the whole point: Exit is the one route that can discard several windows at once,
  // and it asks a single question about all of them.
  expect(exitDialogContent(3, term)).to.contain('3');
  expect(exitDialogContent(3, term)).to.contain(term('umbraDesktop_exitQuestion'));
});

it('reads naturally for a single window rather than saying "1 windows"', () => {
  const content = exitDialogContent(1, term);
  expect(content).to.contain(term('umbraDesktop_exitUnsavedOne'));
  expect(content).to.not.contain('1 windows');
});
