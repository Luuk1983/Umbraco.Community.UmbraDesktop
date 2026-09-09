import { expect } from '@open-wc/testing';
import { planCloseWindows } from './close-windows';
import type { DeskView } from './desk-snapshot';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';

/**
 * Closing is the one desk verb that can destroy something, so the rules here matter more than the
 * plumbing does.
 *
 * Two are absolute. A window holding unsaved changes is never closed, only reported, so the tool
 * cannot lose work even when the agent misunderstands. And the chat's own window is never closed,
 * because ending the conversation halfway through the call that ended it is not a thing a user can
 * have meant.
 */

/** A window on the desk, with only the fields the planner reads. */
function win(id: string, appName: string, over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return {
    id,
    app: { alias: id, name: appName, icon: 'icon-umbraco' } as UmbraDesktopApp,
    rect: { x: 0, y: 0, w: 800, h: 600 },
    z: 1,
    active: false,
    state: 'normal',
    ...over,
  } as UmbraDesktopWindow;
}

/**
 * A stand-in desk.
 * @param windows The open windows.
 * @returns The accessors the planner needs.
 */
function desk(windows: UmbraDesktopWindow[]): DeskView {
  return {
    getWindows: () => windows,
    subjectsOf: () => [],
    getApps: () => [],
  };
}

/** The chat's own window, which every case has to leave alone. */
const SELF = 'chat-window';

/**
 * Plan a close.
 * @param view The desk, or undefined for no desktop.
 * @param args What the model passed.
 * @param selfWindowId The window the chat is in.
 * @returns The plan.
 */
const plan = (
  view: DeskView | undefined,
  args: Record<string, unknown> = {},
  selfWindowId: string | undefined = SELF,
) => planCloseWindows(view, args, (text) => text, selfWindowId);

it('refuses politely when there is no desktop', () => {
  const outcome = plan(undefined);

  expect(outcome.kind).to.equal('unavailable');
  expect(outcome.windowIds ?? [], 'nothing to close').to.deep.equal([]);
});

it('closes everything when told nothing in particular', () => {
  const outcome = plan(desk([win('a', 'Content editor'), win('b', 'Log Viewer'), win(SELF, 'Copilot')]));

  expect(outcome.windowIds).to.have.members(['a', 'b']);
});

it('never closes the window the chat is in', () => {
  // Absolute. Closing it would end the conversation from inside the call the user asked it with,
  // and there is no reading of "close all windows" that wants that.
  const outcome = plan(desk([win(SELF, 'Copilot')]));

  expect(outcome.windowIds).to.deep.equal([]);
  expect(outcome.message.toLowerCase(), 'and it says so rather than claiming success').to.contain(
    'chat',
  );
});

it('will not close the chat window even when asked for it by name', () => {
  const outcome = plan(desk([win('a', 'Content editor'), win(SELF, 'Copilot')]), {
    apps: ['Copilot'],
  });

  expect(outcome.windowIds).to.deep.equal([]);
});

it('leaves a window with unsaved changes alone', () => {
  const outcome = plan(desk([win('a', 'Content editor', { dirty: true }), win(SELF, 'Copilot')]));

  expect(outcome.windowIds, 'unsaved work is never closed over').to.deep.equal([]);
});

it('names the windows it skipped, so the user knows what is left', () => {
  // The reporting half is the point. "Closed some of them" with no explanation would read as a bug.
  const outcome = plan(
    desk([win('a', 'Content editor', { dirty: true }), win('b', 'Log Viewer'), win(SELF, 'Copilot')]),
  );

  expect(outcome.windowIds).to.deep.equal(['b']);
  expect(outcome.message).to.contain('Content editor');
  expect(outcome.message.toLowerCase()).to.contain('unsaved');
});

it('closes only the apps it was asked to close', () => {
  const outcome = plan(
    desk([win('a', 'Content editor'), win('b', 'Log Viewer'), win('c', 'Media library'), win(SELF, 'Copilot')]),
    { apps: ['Log Viewer', 'Media library'] },
  );

  expect(outcome.windowIds).to.have.members(['b', 'c']);
});

it('reports a name that matched nothing open', () => {
  const outcome = plan(desk([win('a', 'Content editor'), win(SELF, 'Copilot')]), {
    apps: ['Log Viewer'],
  });

  expect(outcome.windowIds).to.deep.equal([]);
  expect(outcome.message).to.contain('Log Viewer');
});

it('closes what it can and still reports what it could not find', () => {
  const outcome = plan(desk([win('a', 'Content editor'), win(SELF, 'Copilot')]), {
    apps: ['Content editor', 'Log Viewer'],
  });

  expect(outcome.windowIds).to.deep.equal(['a']);
  expect(outcome.message).to.contain('Log Viewer');
});

it('says so plainly when there was nothing to close', () => {
  const outcome = plan(desk([win(SELF, 'Copilot')]), {});

  expect(outcome.windowIds).to.deep.equal([]);
  expect(outcome.message).to.be.a('string');
});

it('closes a minimized window like any other', () => {
  // Out of sight is still open, and "close everything" means it too.
  const outcome = plan(desk([win('a', 'Log Viewer', { state: 'minimized' }), win(SELF, 'Copilot')]));

  expect(outcome.windowIds).to.deep.equal(['a']);
});

it('closes every window when it cannot tell which one the chat is in', () => {
  // Only reachable off the desktop today, where there is nothing to close anyway. Asserted so the
  // fallback is a decision rather than an accident: an unknown self must not silently mean "close
  // nothing", which would make the tool look broken.
  const outcome = plan(desk([win('a', 'Log Viewer')]), {}, undefined);

  expect(outcome.windowIds).to.deep.equal(['a']);
});
