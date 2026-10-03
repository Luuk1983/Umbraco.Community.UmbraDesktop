import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './board.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const game = { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 0, leaderboards: [{ alias: 'default', label: 'Snake', better: 'higher' as const, format: 'points' as const }] };
const row = (rank: number, name: string, value: number, isViewer = false) => ({ rank, userKey: `k${rank}`, displayName: name, value, achievedAtUtc: '2026-10-01T09:00:00Z', isViewer });

it('lists the top rows with rank, name and score, and marks the viewer', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500), row(2, 'Ada', 300, true)], viewer: row(2, 'Ada', 300, true), viewerIsPublic: true, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('tbody tr').length === 2, 'rows drawn');
  const rows = [...el.shadowRoot!.querySelectorAll('tbody tr')];
  expect(rows[0].textContent).to.contain('Grace').and.contain('500');
  expect(rows[1].classList.contains('viewer')).to.equal(true);
});

it('pins the viewer underneath when they are private or outside the top', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500)], viewer: row(4, 'Ada', 30, true), viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('tfoot tr'), 'viewer pinned');
  expect(el.shadowRoot!.querySelector('tfoot')!.textContent).to.contain('Ada').and.contain('Private');
});

it('says when nobody has played yet', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('.empty'), 'empty state');
});

it('shows moderation buttons only to a moderator', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500)], viewer: null, viewerIsPublic: true, canModerate: true } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="remove"]'), 'remove shown');
  expect(el.shadowRoot!.querySelector('[data-action="reset-board"]')).to.not.equal(null);
});

it('hides moderation from everyone else', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500)], viewer: null, viewerIsPublic: true, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('tbody tr').length === 1, 'rows drawn');
  expect(el.shadowRoot!.querySelector('[data-action="remove"]')).to.equal(null);
  expect(el.shadowRoot!.querySelector('[data-action="reset-board"]')).to.equal(null);
});
