import { expect } from '@open-wc/testing';
import { answerFrom, PROBLEMS_MEMBER } from './site-settings-document.js';

/**
 * How the server document turns what Umbraco's `tryExecute` gives back into the store's answer: a
 * snapshot, a refusal with its reasons, or nothing for a failure the store should send again.
 */

it('answers a stored value with its snapshot', () => {
  expect(answerFrom({ data: { value: '{"a":1}', canChange: true } })).to.deep.equal({ value: '{"a":1}', canChange: true });
});

it('answers nothing stored as a null value', () => {
  expect(answerFrom({ data: { canChange: false } })).to.deep.equal({ value: null, canChange: false });
});

/** The body the server sends for a refused change, as the real run measured it arriving. */
const refusedBody = (problems: string[]) => ({
  type: 'UmbraDesktopSiteSettingsRefused',
  title: 'The change was refused.',
  status: 400,
  [PROBLEMS_MEMBER]: problems,
});

it('answers a 400 with the reasons the server listed, as the generated client hands over the body', () => {
  expect(answerFrom({ error: refusedBody(['Too big.']), response: { status: 400 } })).to.deep.equal({ refused: ['Too big.'] });
});

it('answers a 400 with its reasons when they come wrapped in an Umbraco API error', () => {
  expect(answerFrom({ error: { problemDetails: refusedBody(['Too big.']) } })).to.deep.equal({ refused: ['Too big.'] });
});

it('answers a 400 without reasons as a refusal still, with a general one', () => {
  expect(answerFrom({ error: { type: null, title: 'Bad Request', status: 400 }, response: { status: 400 } })).to.deep.equal({
    refused: ['Bad Request'],
  });
});

it('answers a 403, a server error or no answer at all as a failure', () => {
  expect(answerFrom({ error: { title: 'Forbidden', status: 403 }, response: { status: 403 } })).to.equal(undefined);
  expect(answerFrom({ error: { problemDetails: { status: 500, title: 'Boom' } } })).to.equal(undefined);
  expect(answerFrom({ error: new Error('offline') })).to.equal(undefined);
  expect(answerFrom({})).to.equal(undefined);
});
