import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestReport, formatReport } from '../src/guests.mjs';

const ep = (...names) => ({ guests: names.map((name) => ({ name, affiliation: null })) });

test('guestReport counts episodes per name, sorted by count then name', () => {
  const report = guestReport([ep('Zoe Adams', 'Bob Brown'), ep('Bob Brown'), ep('Ann Clark'), ep('Bob Brown', 'Bob Brown')]);
  assert.deepEqual(report.names, [
    { name: 'Bob Brown', count: 3 },
    { name: 'Ann Clark', count: 1 },
    { name: 'Zoe Adams', count: 1 },
  ]);
});

test('guestReport suggests same last name and first initial as variants', () => {
  const report = guestReport([ep('Jon Smith'), ep('Jonathan Smith'), ep('Jonathan Smith'), ep('Kate Smith')]);
  assert.deepEqual(report.variants, [{ names: ['Jonathan Smith', 'Jon Smith'], reason: 'same last name and first initial' }]);
});

test('guestReport suggests names that match once accents and case are folded', () => {
  const report = guestReport([ep('Søren Kottal'), ep('Soren Kottal'), ep('José Núñez'), ep('jose nunez')]);
  const reasons = report.variants.map((v) => `${v.names.join(' / ')}: ${v.reason}`);
  assert.ok(reasons.includes('José Núñez / jose nunez: same name apart from accents or case'), reasons.join('\n'));
});

test('guestReport suggests a bare first name that prefixes a full name', () => {
  const report = guestReport([ep('Jesper'), ep('Jesper Mayntzhusen'), ep('Jesper Mayntzhusen')]);
  assert.deepEqual(report.variants, [{ names: ['Jesper Mayntzhusen', 'Jesper'], reason: 'first name only' }]);
});

test('guestReport suggests nothing for distinct people', () => {
  assert.deepEqual(guestReport([ep('Ann Clark'), ep('Bob Brown')]).variants, []);
});

test('formatReport prints counts and variants as plain lines', () => {
  const text = formatReport(guestReport([ep('Jesper'), ep('Jesper Mayntzhusen'), ep('Jesper Mayntzhusen')]));
  assert.match(text, /^\s*2 {2}Jesper Mayntzhusen$/m);
  assert.match(text, /^\s*1 {2}Jesper$/m);
  assert.match(text, /Jesper Mayntzhusen \(2\) \/ Jesper \(1\): first name only/);
});
