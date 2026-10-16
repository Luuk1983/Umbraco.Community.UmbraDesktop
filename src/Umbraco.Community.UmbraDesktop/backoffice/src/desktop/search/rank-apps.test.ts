import { expect } from '@open-wc/testing';
import { rankApps } from './rank-apps';
import type { UmbraDesktopApp } from '../types';

const app = (name: string) => ({ alias: name, name }) as UmbraDesktopApp;
const names = (apps: UmbraDesktopApp[]) => apps.map((a) => a.name);
const APPS = ['Media library', 'Log Viewer', 'Content editor', 'Logs archive', 'Catalogue'].map(app);

it('puts a name starting with the query first, then a word starting with it, then one containing it', () => {
  expect(names(rankApps(APPS, (a) => a.name, 'log'))).to.deep.equal(['Log Viewer', 'Logs archive', 'Catalogue']);
});

it('matches whatever the case', () => {
  expect(names(rankApps(APPS, (a) => a.name, 'MEDIA'))).to.deep.equal(['Media library']);
});

it('matches on the name it is given, which is the translated one', () => {
  expect(names(rankApps([app('#token')], () => 'Inhoud', 'inh'))).to.deep.equal(['#token']);
});

it('matches nothing for an empty or blank query', () => {
  expect(rankApps(APPS, (a) => a.name, '   ')).to.deep.equal([]);
});
