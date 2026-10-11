import { expect } from '@open-wc/testing';
import { alphabetise, filterApps, letterOf } from './alphabet';
import type { UmbraDesktopApp } from '../types';

/**
 * A stand-in app whose name is the thing under test.
 * @param name The display name.
 * @returns The app.
 */
const named = (name: string): UmbraDesktopApp => ({
  alias: name.toLowerCase(),
  name,
  icon: 'icon-box',
  content: { kind: 'iframe', url: '/x' },
  chromeProfile: 'bare',
});
/**
 * The name the drawer sorts and filters on. The stand-ins carry their display name as their name,
 * so nothing needs translating.
 * @param app The app.
 * @returns Its name.
 */
const nameOf = (app: UmbraDesktopApp) => app.name;

it('files a name under its first letter, uppercased, without its accent', () => {
  expect(letterOf('media', 'en-us')).to.equal('M');
  expect(letterOf('Éditeur', 'fr-fr')).to.equal('E');
});

it('files a name that does not start with a letter under #', () => {
  expect(letterOf('3D viewer', 'en-us')).to.equal('#');
  expect(letterOf('', 'en-us')).to.equal('#');
});

it('sorts by name in the culture and groups consecutive names under one letter', () => {
  const sections = alphabetise([named('Media'), named('Content'), named('members'), named('Deploy')], nameOf, 'en-us');
  expect(sections.map((s) => [s.letter, s.apps.map((a) => a.name)])).to.deep.equal([
    ['C', ['Content']],
    ['D', ['Deploy']],
    ['M', ['Media', 'members']],
  ]);
});

it('does not throw on a culture the browser does not know', () => {
  expect(() => alphabetise([named('Content')], nameOf, 'not-a-culture!!')).to.not.throw();
});

it('matches anywhere in the name, ignoring case, and returns everything for an empty filter', () => {
  const apps = [named('Log Viewer'), named('Content'), named('Webhooks')];
  expect(filterApps(apps, nameOf, 'VIEW').map((a) => a.name)).to.deep.equal(['Log Viewer']);
  expect(filterApps(apps, nameOf, '   ').map((a) => a.name)).to.deep.equal(['Log Viewer', 'Content', 'Webhooks']);
});
