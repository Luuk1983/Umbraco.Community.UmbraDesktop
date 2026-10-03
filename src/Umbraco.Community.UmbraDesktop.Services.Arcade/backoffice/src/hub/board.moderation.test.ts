import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './board.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const game = { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 0, leaderboards: [{ alias: 'default', label: 'Snake', better: 'higher' as const, format: 'points' as const }] };
const row = (rank: number, name: string, value: number) => ({ rank, userKey: `k${rank}`, displayName: name, value, achievedAtUtc: '2026-10-01T09:00:00Z', isViewer: false });

/** A moderator's board with one row. */
const moderated = { played: true, top: [row(1, 'Grace', 500)], viewer: null, viewerIsPublic: true, canModerate: true };

it('asks for confirmation before resetting a name, and does nothing when declined', async () => {
  const { wrapper, calls } = await arcadeHarness({ board: moderated, confirmAnswer: 'cancel' });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="reset-name"]'), 'drawn');
  (el.shadowRoot!.querySelector('[data-action="reset-name"]') as HTMLElement).click();
  await waitUntil(() => calls.some((c) => c.startsWith('confirm:')), 'asked');
  await new Promise((r) => setTimeout(r, 50));
  expect(calls.some((c) => c.startsWith('resetName'))).to.equal(false);
});

it('resets the name once confirmed', async () => {
  const { wrapper, calls } = await arcadeHarness({ board: moderated });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="reset-name"]'), 'drawn');
  (el.shadowRoot!.querySelector('[data-action="reset-name"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('resetName:k1'), JSON.stringify(calls));
});

it('says so when a moderation action fails', async () => {
  const { wrapper } = await arcadeHarness({ board: moderated, failWrites: true });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="remove"]'), 'drawn');
  (el.shadowRoot!.querySelector('[data-action="remove"]') as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelector('[role="alert"]'), 'failure shown');
});

it('gives the table column headers and an accessible name', async () => {
  const { wrapper } = await arcadeHarness({ board: moderated });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('thead'), 'drawn');
  const heads = [...el.shadowRoot!.querySelectorAll('thead th')];
  expect(heads).to.have.length(5);
  expect(heads.every((h) => h.getAttribute('scope') === 'col')).to.equal(true);
  expect(el.shadowRoot!.querySelector('table')!.getAttribute('aria-label')).to.equal('Snake');
});

it('offers Retry when the board could not be loaded, and loads again', async () => {
  let down = true;
  const { wrapper } = await arcadeHarness({ boardFor: () => (down ? undefined : moderated) });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="retry"]'), 'retry shown');
  down = false;
  (el.shadowRoot!.querySelector('[data-action="retry"]') as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelectorAll('tbody tr').length === 1, 'loaded on retry');
});
