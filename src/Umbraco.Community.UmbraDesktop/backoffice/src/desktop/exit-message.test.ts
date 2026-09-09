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
  const content = exitDialogContent(0, 0, term);
  expect(content).to.equal(term('umbraDesktop_exitQuestion'));
});

it('states how many windows have unsaved changes', () => {
  // The count is the whole point: Exit is the one route that can discard several windows at once,
  // and it asks a single question about all of them.
  expect(exitDialogContent(3, 0, term)).to.contain('3');
  expect(exitDialogContent(3, 0, term)).to.contain(term('umbraDesktop_exitQuestion'));
});

it('reads naturally for a single window rather than saying "1 windows"', () => {
  const content = exitDialogContent(1, 0, term);
  expect(content).to.contain(term('umbraDesktop_exitUnsavedOne'));
  expect(content).to.not.contain('1 windows');
});

describe('windows that also changed elsewhere', () => {
  /** A localizer that returns the key and its arguments, so a test can read what was asked for. */
  const term = (key: string, ...args: unknown[]) => (args.length ? `${key}(${args.join(',')})` : key);

  it('says nothing extra when nothing changed elsewhere', () => {
    expect(exitDialogContent(2, 0, term)).to.equal(
      'umbraDesktop_exitUnsaved(2) umbraDesktop_exitQuestion',
    );
  });

  it('names the single window directly rather than as one of them', () => {
    expect(exitDialogContent(1, 1, term)).to.equal(
      'umbraDesktop_exitUnsavedOne umbraDesktop_exitConflictedSole umbraDesktop_exitQuestion',
    );
  });

  it('says one of them when several windows are unsaved', () => {
    expect(exitDialogContent(3, 1, term)).to.equal(
      'umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedOne umbraDesktop_exitQuestion',
    );
  });

  it('counts more than one', () => {
    expect(exitDialogContent(3, 2, term)).to.equal(
      'umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedMany(2) umbraDesktop_exitQuestion',
    );
  });

  it('ignores a conflicted count with no unsaved windows, which cannot happen', () => {
    expect(exitDialogContent(0, 2, term)).to.equal('umbraDesktop_exitQuestion');
  });
});
