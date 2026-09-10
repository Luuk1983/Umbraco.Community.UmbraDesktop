import { expect } from '@open-wc/testing';
import { planOpenWindow } from './open-window';
import type { DeskView } from './desk-snapshot';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';

/**
 * The one thing the agent can do on the desktop that it cannot do anywhere else in Umbraco: hand
 * you something without taking itself away. In a single-page shell, following a link is a
 * navigation and the chat resets; here it is a second window beside the chat.
 *
 * Two ways to be called, and they are different capabilities rather than two spellings of one. An
 * entity is a document or media item the agent found server-side. An app is one of the desktop's
 * own tiles, which no server-side tool can reach at all.
 *
 * The decision is tested as a plan rather than through the window manager, so these cases are about
 * what should happen rather than about the manager's plumbing, which `window-manager.test.ts`
 * already owns.
 */

/** A window on the desk, with only the fields the planner reads. */
function win(id: string, appAlias: string): UmbraDesktopWindow {
  return {
    id,
    app: { alias: appAlias, name: appAlias, icon: 'icon-umbraco' } as UmbraDesktopApp,
    rect: { x: 0, y: 0, w: 800, h: 600 },
    z: 1,
    active: false,
    state: 'normal',
  } as UmbraDesktopWindow;
}

/** A subject, with only the two identity fields the planner matches on. */
function subject(entityType: string, unique: string): UmbraDesktopWorkspaceSubject {
  return { entityType, unique } as UmbraDesktopWorkspaceSubject;
}

/**
 * A stand-in desk.
 * @param windows The open windows.
 * @param subjects What each window is showing, by window id.
 * @param apps What the launcher would offer.
 * @returns The three accessors the planner needs.
 */
function desk(
  windows: UmbraDesktopWindow[] = [],
  subjects: Record<string, UmbraDesktopWorkspaceSubject[]> = {},
  apps: Array<{ alias: string; name: string }> = [],
): DeskView {
  return {
    getWindows: () => windows,
    subjectsOf: (id: string) => subjects[id] ?? [],
    getApps: () => apps.map((app) => ({ ...app, icon: 'icon-umbraco' }) as UmbraDesktopApp),
  };
}

/**
 * Plan one call.
 *
 * The localiser defaults to pass-through for the cases that are not about names. The app branch
 * needs a real one because a catalogue app's `name` is usually a manifest label token.
 * @param view The desk, or undefined for no desktop.
 * @param args What the model passed.
 * @param localise Resolves an app's name.
 * @returns The plan.
 */
const plan = (
  view: DeskView | undefined,
  args: Record<string, unknown>,
  localise: (text: string) => string = (text) => text,
) => planOpenWindow(view, args, localise);

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

/** A catalogue of three apps, their names the localisation tokens they really are. */
const APPS = [
  { alias: 'content', name: '#umbraDesktop_appContentEditor' },
  { alias: 'log-viewer', name: '#umbraDesktop_appLogViewer' },
  { alias: 'background-jobs', name: '#umbraDesktop_appBackgroundJobs' },
];

/** Resolves those three tokens, as the real localizer would. */
const LOCALISE = (text: string) =>
  ({
    '#umbraDesktop_appContentEditor': 'Content editor',
    '#umbraDesktop_appLogViewer': 'Log Viewer',
    '#umbraDesktop_appBackgroundJobs': 'Background Jobs',
  })[text] ?? text;

it('refuses politely when there is no desktop, and does not throw', () => {
  // Umbraco has no per-surface conditions for frontend tools yet, so this tool is offered to the
  // Copilot sidebar in a plain backoffice too. Throwing would work — the executor catches it and
  // tells the model — but it marks the call failed in the chat, and there is no failure here. It is
  // simply the wrong room.
  const outcome = plan(undefined, { entityType: 'document', unique: KEY });

  expect(outcome.kind).to.equal('unavailable');
  expect(outcome.message, 'the model has to be told to answer without opening anything').to.be.a(
    'string',
  );
});

it('never falls back to navigating the backoffice', () => {
  // The failure that would look like success. Navigating the host page away from the chat is the
  // exact problem this tool exists to avoid, and off the desktop it would throw the user out of
  // whatever they were doing.
  const outcome = plan(undefined, { entityType: 'document', unique: KEY });

  expect(outcome).to.not.have.property('app');
  expect(outcome).to.not.have.property('windowId');
});

it('opens a document in a window of its own', () => {
  const outcome = plan(desk(), { entityType: 'document', unique: KEY });

  expect(outcome.kind).to.equal('open');
  expect((outcome as { app: UmbraDesktopApp }).app.content).to.deep.equal({
    kind: 'iframe',
    url: `/umbraco/section/content/workspace/document/edit/${KEY}`,
  });
});

it('opens a media item in a window of its own', () => {
  const outcome = plan(desk(), { entityType: 'media', unique: KEY });

  expect(outcome.kind).to.equal('open');
  expect((outcome as { app: UmbraDesktopApp }).app.content).to.deep.equal({
    kind: 'iframe',
    url: `/umbraco/section/media/workspace/media/edit/${KEY}`,
  });
});

it('strips the section sidebar, because a chat answer is one document and not a tree', () => {
  const outcome = plan(desk(), { entityType: 'document', unique: KEY });

  expect((outcome as { app: UmbraDesktopApp }).app.chromeProfile).to.equal('workspace-only');
});

it('gives each target its own app alias, so two answers are two windows', () => {
  const first = plan(desk(), { entityType: 'document', unique: KEY });
  const second = plan(desk(), {
    entityType: 'document',
    unique: 'bbbbbbbb-5555-6666-7777-888888888888',
  });

  const a = (first as { app: UmbraDesktopApp }).app;
  const b = (second as { app: UmbraDesktopApp }).app;
  expect(a.alias, 'window identity keys off the alias').to.not.equal(b.alias);
  expect(a.allowMultiple, 'but the same target twice is one window').to.equal(false);
});

it('focuses a window that is already showing the target, rather than opening a second', () => {
  // The important case, and the reason matching is on the subject rather than on our own alias: the
  // user very often already has the thing open in their Content window. A second window on one
  // document is the conflict the overwrite guard exists for, and here we would have caused it.
  const outcome = plan(desk([win('w1', 'content')], { w1: [subject('document', KEY)] }), {
    entityType: 'document',
    unique: KEY,
  });

  expect(outcome.kind).to.equal('focus');
  expect((outcome as { windowId: string }).windowId).to.equal('w1');
});

it('focuses a window it opened earlier, before that frame has reported what it shows', () => {
  // The gap the subject match alone leaves. Between opening a window and its frame loading, the
  // desktop knows the app but not the document, so a second call in that window would stack a
  // duplicate if the alias were not checked too.
  const first = plan(desk(), { entityType: 'document', unique: KEY });
  const alias = (first as { app: UmbraDesktopApp }).app.alias;

  const outcome = plan(desk([win('w9', alias)]), { entityType: 'document', unique: KEY });

  expect(outcome.kind).to.equal('focus');
  expect((outcome as { windowId: string }).windowId).to.equal('w9');
});

it('does not mistake a different document in an open window for the target', () => {
  // The control for the focus cases above. Without it they would pass on a planner that focused the
  // first window it found, which would answer every request with the wrong page.
  const outcome = plan(desk([win('w1', 'content')], { w1: [subject('document', 'not-the-one')] }), {
    entityType: 'document',
    unique: KEY,
  });

  expect(outcome.kind).to.equal('open');
});

it('does not mistake media for a document with the same key', () => {
  const outcome = plan(desk([win('w1', 'media')], { w1: [subject('media', KEY)] }), {
    entityType: 'document',
    unique: KEY,
  });

  expect(outcome.kind).to.equal('open');
});

it('rejects an entity type it cannot build a window for, and says what it can', () => {
  const outcome = plan(desk(), { entityType: 'member', unique: KEY });

  expect(outcome.kind).to.equal('rejected');
  const message = (outcome as { message: string }).message;
  expect(message, 'a bare refusal teaches the model nothing').to.contain('document');
  expect(message).to.contain('media');
});

it('rejects a missing or empty key rather than opening a broken window', () => {
  // A window on `.../edit/undefined` boots a whole backoffice to show an error, which reads to the
  // user as the desktop being broken rather than the agent having guessed.
  for (const bad of [undefined, '', '   ']) {
    const outcome = plan(desk(), { entityType: 'document', unique: bad });
    expect(outcome.kind, `unique ${JSON.stringify(bad)} must be refused`).to.equal('rejected');
  }
});

it("opens one of the desktop's own apps by name", () => {
  // The capability the agent has nowhere else in Umbraco: "open the log viewer" is not a document,
  // so no server-side tool can reach it.
  const outcome = plan(desk([], {}, APPS), { app: 'Log Viewer' }, LOCALISE);

  expect(outcome.kind).to.equal('open');
  expect((outcome as { app: UmbraDesktopApp }).app.alias).to.equal('log-viewer');
});

it('matches the name a person would say, not the token', () => {
  // The whole reason the localiser is a parameter. Matching on `app.name` would only ever match
  // "#umbraDesktop_appLogViewer", which nobody says out loud.
  const outcome = plan(desk([], {}, APPS), { app: 'log viewer' }, LOCALISE);

  expect(outcome.kind, 'case is not something to refuse over').to.equal('open');
});

it('accepts a name that is close enough to be unambiguous', () => {
  const outcome = plan(desk([], {}, APPS), { app: 'background' }, LOCALISE);

  expect(outcome.kind).to.equal('open');
  expect((outcome as { app: UmbraDesktopApp }).app.alias).to.equal('background-jobs');
});

it('opens the catalogue’s own app object, chrome and size included', () => {
  // Not a window we describe ourselves: the catalogue already decided this app's URL, its chrome
  // profile and how big it opens, and a second opinion here would drift from the launcher's.
  // One desk, so identity means something: `getApps` builds fresh objects per call.
  const view = desk([], {}, APPS);
  const expected = view.getApps().find((a) => a.alias === 'log-viewer');

  const outcome = plan(view, { app: 'Log Viewer' }, LOCALISE);

  const app = (outcome as { app: UmbraDesktopApp }).app;
  expect(app.alias).to.equal(expected!.alias);
  expect(app.chromeProfile, 'the catalogue decides the chrome, not this planner').to.equal(
    expected!.chromeProfile,
  );
  expect(app.content, 'and the URL').to.deep.equal(expected!.content);
});

it('refuses an unknown app by listing the ones that exist', () => {
  // The refusal doubles as discovery: the agent learns the catalogue at the moment it needs it,
  // even when it never called the describe tool first.
  const outcome = plan(desk([], {}, APPS), { app: 'Photoshop' }, LOCALISE);

  expect(outcome.kind).to.equal('rejected');
  const message = (outcome as { message: string }).message;
  expect(message).to.contain('Log Viewer');
  expect(message).to.contain('Content editor');
});

it('refuses an ambiguous name rather than guessing which was meant', () => {
  const outcome = plan(
    desk([], {}, [
      { alias: 'a', name: 'Document Types' },
      { alias: 'b', name: 'Document Type access' },
    ]),
    { app: 'document type' },
  );

  expect(outcome.kind).to.equal('rejected');
  expect((outcome as { message: string }).message).to.contain('Document Types');
});

it('focuses an app window that is already open instead of stacking another', () => {
  const outcome = plan(desk([win('w4', 'log-viewer')], {}, APPS), { app: 'Log Viewer' }, LOCALISE);

  expect(outcome.kind).to.equal('focus');
  expect((outcome as { windowId: string }).windowId).to.equal('w4');
});

it('refuses when told neither what entity nor what app to open', () => {
  const outcome = plan(desk([], {}, APPS), {});

  expect(outcome.kind).to.equal('rejected');
});

it('refuses when given both an app and an entity, rather than silently picking one', () => {
  // A model that passes both has misunderstood, and quietly honouring one of them hides that.
  const outcome = plan(
    desk([], {}, APPS),
    { app: 'Log Viewer', entityType: 'document', unique: KEY },
    LOCALISE,
  );

  expect(outcome.kind).to.equal('rejected');
});

it('opens a second window on the same document when explicitly asked', () => {
  // The case that exposed this: "I need two content editors on the same node for a demo". The
  // desktop has always allowed it — the Content editor app is `allowMultiple: true`, and two
  // windows on one document is how the overwrite guard gets tested — so a tool that could not do it
  // was removing an affordance the launcher offers, and the agent then invented a reason why the
  // desktop could not.
  const outcome = plan(desk([win('w1', 'content')], { w1: [subject('document', KEY)] }), {
    entityType: 'document',
    unique: KEY,
    newWindow: true,
  });

  expect(outcome.kind, 'the focus rule is a default, not a law').to.equal('open');
});

it('gives the second window an alias of its own, or the manager would focus the first', () => {
  const first = plan(desk(), { entityType: 'document', unique: KEY });
  const firstApp = (first as { app: UmbraDesktopApp }).app;

  const second = plan(desk([win('w1', firstApp.alias)]), {
    entityType: 'document',
    unique: KEY,
    newWindow: true,
  });
  const secondApp = (second as { app: UmbraDesktopApp }).app;

  expect(secondApp.alias).to.not.equal(firstApp.alias);
  expect(secondApp.allowMultiple, 'and it must not forbid its own duplicate').to.not.equal(false);
});

it('says that two editors on one document is the situation the guard warns about', () => {
  // Not a footgun to hide. The desktop's whole overwrite story is about this state, so the moment
  // the agent creates it deliberately is the moment to name it.
  const outcome = plan(desk([win('w1', 'content')], { w1: [subject('document', KEY)] }), {
    entityType: 'document',
    unique: KEY,
    newWindow: true,
  });

  expect((outcome as { message: string }).message.toLowerCase()).to.contain('unsaved');
});

it('opens a second window on a desktop app when asked, rather than focusing', () => {
  const outcome = plan(
    desk([win('log-viewer', 'log-viewer')], {}, APPS),
    { app: 'Log Viewer', newWindow: true },
    LOCALISE,
  );

  expect(outcome.kind).to.equal('open');
});

it('still focuses by default, which is what a plain "show me X" wants', () => {
  // The control for all four above. Without it they would pass on a planner that had simply lost
  // the focus rule, which would stack a duplicate every time the agent mentioned the same page.
  const outcome = plan(desk([win('w1', 'content')], { w1: [subject('document', KEY)] }), {
    entityType: 'document',
    unique: KEY,
  });

  expect(outcome.kind).to.equal('focus');
});
