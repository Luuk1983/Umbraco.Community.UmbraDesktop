import { expect } from '@open-wc/testing';
import { html, render } from '@umbraco-cms/backoffice/external/lit';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { AVATAR_HUES, avatarHue, entryRow, initials, listRows, medalKind, podium, shortBoardRows } from './parts.js';

/** A board row, keyed by name so a player is the same player wherever they appear. */
const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry =>
  ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
/** A board read from its top rows, the viewer and the player directly above them. */
const board = (top: ArcadeBoardEntry[], viewer: ArcadeBoardEntry | null, above: ArcadeBoardEntry | null = null): ArcadeBoard =>
  ({ played: true, top, viewer, viewerIsPublic: true, canModerate: false, players: 12, above });

it('takes initials from the first and last word', () => {
  expect(initials('Luuk Peters')).to.equal('LP');
  expect(initials('Anna de Vries')).to.equal('AV');
  expect(initials('Ada')).to.equal('A');
  expect(initials('   ')).to.equal('?');
});

it('gives each player a stable avatar colour', () => {
  expect(avatarHue('k-1')).to.equal(avatarHue('k-1'));
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) expect(avatarHue(key)).to.be.within(0, AVATAR_HUES - 1);
});

it('gives the top three their metals and everyone else a plain disc', () => {
  expect([1, 2, 3, 4, 12].map(medalKind)).to.deep.equal(['g', 's', 'b', 'p', 'p']);
});

it('stands the podium second, first, third from left to right', () => {
  const host = document.createElement('div');
  render(podium([entry(1, 'Tom', 3960), entry(2, 'Sophie', 3710), entry(3, 'Anna', 3120)], { format: 'points', you: 'You', lang: 'en-US' }), host);
  expect([...host.querySelectorAll('.pod')].map((p) => p.getAttribute('data-rank'))).to.deep.equal(['2', '1', '3']);
});

it('draws a podium extra once per entry, for the hub\'s moderator menu', () => {
  const host = document.createElement('div');
  const extra = (e: ArcadeBoardEntry) => html`<i class="extra">${e.rank}</i>`;
  render(podium([entry(1, 'Tom', 3960), entry(2, 'Sophie', 3710)], { format: 'points', you: 'You', lang: 'en-US', extra }), host);
  expect([...host.querySelectorAll('.extra')].map((i) => i.textContent)).to.deep.equal(['2', '1']);
});

it('names the viewer You in a row, or marks them beside their name', () => {
  const host = document.createElement('div');
  render(entryRow(entry(3, 'Luuk Peters', 38_100, true), { format: 'time', you: 'You', lang: 'en-US', youMode: 'replace' }), host);
  expect(host.querySelector('.who')!.textContent).to.equal('You');
  render(entryRow(entry(12, 'Luuk Peters', 1_140, true), { format: 'points', you: 'You', lang: 'en-US', youMode: 'mark' }), host);
  expect(host.querySelector('.who')!.textContent).to.equal('Luuk Peters');
  expect(host.querySelector('.you')!.textContent).to.equal('You');
});

it('draws a hidden viewer as a ghost row that says only they see it', () => {
  const host = document.createElement('div');
  render(entryRow(entry(2, 'Ada', 300, true), { format: 'points', you: 'You', lang: 'en-US', youMode: 'replace', onlyYou: 'Only you see this' }), host);
  expect(host.querySelector('.lr')!.classList.contains('ghost')).to.equal(true);
  expect(host.textContent).to.contain('Only you see this');
});

it('makes the short board the top three when the viewer is in it, renumbered as the viewer sees it', () => {
  const rows = shortBoardRows(board([entry(1, 'Grace', 500), entry(2, 'Bram', 450), entry(3, 'Noor', 290)], entry(1, 'Ada', 600, true)));
  expect(rows.map((r) => (r === 'gap' ? 'gap' : `${r.rank}:${r.displayName}`))).to.deep.equal(['1:Ada', '2:Grace', '3:Bram']);
});

it('lists a hidden viewer inside the top ten in their place, renumbered as the viewer sees it', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i));
  const { rows, pinned } = listRows(board(top, entry(2, 'Ada', 999, true)));
  expect(rows.map((r) => `${r.rank}:${r.displayName}`)).to.deep.equal(['1:P1', '2:Ada', '3:P2', '4:P3', '5:P4', '6:P5', '7:P6', '8:P7', '9:P8', '10:P9']);
  expect(pinned).to.equal(undefined);
});

it('pins a viewer outside the top ten under the list, and lists a shown viewer as the board has them', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i, i === 4));
  const outside = listRows(board(top.map((e) => ({ ...e, isViewer: false })), entry(12, 'Ada', 5, true)));
  expect(outside.rows.map((r) => r.rank)).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(outside.pinned?.rank).to.equal(12);
  const shown = listRows(board(top, entry(5, 'P5', 996, true)));
  expect(shown.rows.map((r) => `${r.rank}:${r.displayName}`)).to.deep.equal(top.map((r) => `${r.rank}:${r.displayName}`));
  expect(shown.pinned).to.equal(undefined);
});

it('lists every shown player when a hidden viewer places inside a short board, renumbered as the viewer sees it', () => {
  const top = [entry(1, 'A', 300), entry(2, 'B', 200), entry(3, 'C', 100)];
  const { rows, pinned } = listRows(board(top, entry(2, 'Ada', 250, true)));
  expect(rows.map((r) => `${r.rank}:${r.displayName}`)).to.deep.equal(['1:A', '2:Ada', '3:B', '4:C']);
  expect(pinned).to.equal(undefined);
});

it('lists a hidden viewer just under a short board rather than pinning them under a gap', () => {
  const top = [entry(1, 'A', 300), entry(2, 'B', 200), entry(3, 'C', 100)];
  const { rows, pinned } = listRows(board(top, entry(4, 'Ada', 50, true)));
  expect(rows.map((r) => `${r.rank}:${r.displayName}`)).to.deep.equal(['1:A', '2:B', '3:C', '4:Ada']);
  expect(pinned).to.equal(undefined);
});

it('pins a viewer right under a full list without a gap, since nobody stands between', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i));
  const { rows, pinned, gap } = listRows(board(top, entry(11, 'Ada', 5, true)));
  expect(rows).to.have.length(10);
  expect(pinned?.rank).to.equal(11);
  expect(gap).to.equal(false);
});

it('pins a viewer further down under a gap, since players stand between', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i));
  const { pinned, gap } = listRows(board(top, entry(14, 'Ada', 5, true)));
  expect(pinned?.rank).to.equal(14);
  expect(gap).to.equal(true);
});

it('makes the short board the leader, the one above and the viewer when the viewer is further down', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i));
  const rows = shortBoardRows(board(top, entry(12, 'Ada', 5, true), entry(11, 'P11', 10)));
  expect(rows.map((r) => (r === 'gap' ? 'gap' : `${r.rank}:${r.displayName}`))).to.deep.equal(['1:P1', 'gap', '11:P11', '12:Ada']);
});

it('keeps the player above in the short board when they tie with the leader', () => {
  const top = [entry(1, 'Grace', 500), entry(1, 'Bram', 500), entry(1, 'Noor', 500)];
  const rows = shortBoardRows(board(top, entry(4, 'Ada', 100, true), entry(1, 'Noor', 500)));
  expect(rows.map((r) => (r === 'gap' ? 'gap' : `${r.rank}:${r.displayName}`))).to.deep.equal(['1:Grace', '1:Noor', '4:Ada']);
});

it('marks a hidden viewer on the podium as only they see it, and a shown one not', () => {
  const host = document.createElement('div');
  const top = [entry(1, 'Tom', 3960), entry(2, 'Ada', 3710, true)];
  render(podium(top, { format: 'points', you: 'You', lang: 'en-US', onlyYou: 'Only you see this' }), host);
  const mine = host.querySelector('.pod.mine')!;
  expect(mine.classList.contains('ghost')).to.equal(true);
  expect(mine.querySelector('.only')?.textContent).to.equal('Only you see this');
  expect(host.querySelectorAll('.only')).to.have.length(1);
  render(podium(top, { format: 'points', you: 'You', lang: 'en-US' }), host);
  expect(host.querySelector('.pod.mine')!.classList.contains('ghost')).to.equal(false);
  expect(host.querySelectorAll('.only')).to.have.length(0);
});
