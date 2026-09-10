import type { DeskView, UmbraDesktopLocalise } from './desk-snapshot';
import type { UmbraDesktopApp } from '../types';
import { matchByLabel } from './name-match';
import { UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN } from '@umbraco-cms/backoffice/document';
import { UMB_EDIT_MEDIA_WORKSPACE_PATH_PATTERN } from '@umbraco-cms/backoffice/media';

/**
 * Decides what the agent's "open this in a window" tool should do. Pure: the api applies the plan.
 *
 * The value of the tool is narrow and specific. The agent can already find anything server-side;
 * what it cannot do anywhere else in Umbraco is hand you the page without taking itself away,
 * because in a single-page shell following a link is a navigation and the chat panel resets. On the
 * desktop the answer is a second window beside the chat, and both survive.
 */

/** Backoffice mount path, as `url-inference.ts` has it: core's patterns are relative to it. */
const BACKOFFICE_PATH = '/umbraco';

/**
 * Mount a core path pattern's output under the backoffice.
 *
 * `generateAbsolute` is absolute within the backoffice router and returns no leading slash, so a
 * plain concatenation produces `/umbracosection/...` — a URL that loads, badly, as a relative path.
 * Normalised rather than assumed, because "absolute" meaning "no leading slash" is surprising
 * enough that it could equally be corrected in a future version.
 * @param path A path from `UmbPathPattern.generateAbsolute`.
 * @returns The URL to put in a window's iframe.
 */
function backofficeUrl(path: string): string {
  return `${BACKOFFICE_PATH}/${path.replace(/^\/+/, '')}`;
}

/**
 * The entity types this tool can build a window for, and how.
 *
 * Two, and deliberately not more. Documents and media are what the agent's own read tools return
 * and what an editor means by "show me that", and each one added is a route that has to be right on
 * every Umbraco version. The paths come from core's own patterns rather than being written out, so
 * a route change breaks the build here instead of shipping a window onto a 404.
 */
const OPENABLE: Record<string, { icon: string; path: (unique: string) => string }> = {
  document: {
    icon: 'icon-document',
    path: (unique) => UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateAbsolute({ unique }),
  },
  media: {
    icon: 'icon-picture',
    path: (unique) => UMB_EDIT_MEDIA_WORKSPACE_PATH_PATTERN.generateAbsolute({ unique }),
  },
};

/**
 * The size a window opened this way gets.
 *
 * The catalogue's convention for a `workspace-only` entry, which is the same shape: one workspace
 * with no section sidebar to lean on, so it opens larger than a section would and carries a floor
 * below which the workspace's own layout stops working.
 */
const CONTENT_SIZE = { w: 1200, h: 780 };
/** The resize floor that goes with {@link CONTENT_SIZE}. */
const CONTENT_MIN_SIZE = { w: 900, h: 540 };

/** What the tool decided to do. */
export type OpenWindowPlan =
  /** There is no desktop here; say so and open nothing. */
  | { kind: 'unavailable'; message: string }
  /** The request cannot be honoured; say why. */
  | { kind: 'rejected'; message: string }
  /** The target is already on the desk; raise that window. */
  | { kind: 'focus'; windowId: string; message: string }
  /** Open this. */
  | { kind: 'open'; app: UmbraDesktopApp; message: string };

/**
 * The app alias for one target.
 *
 * Per-target because window identity keys off the alias, so this is what makes "the same document
 * twice" one window rather than two, via the manager's own `allowMultiple` check.
 * @param entityType The entity type.
 * @param unique The entity's key.
 * @returns A stable alias for that target.
 */
function aliasFor(entityType: string, unique: string): string {
  return `umbradesktop-ai-open:${entityType}:${unique}`;
}

/**
 * An alias no open window is using, derived from a base one.
 *
 * Needed only for a deliberate duplicate. Window identity keys off the alias, so a second window on
 * one target has to be a distinguishable app or the manager's own `allowMultiple` check would focus
 * the first and the duplicate would never appear.
 *
 * Counted rather than randomised so the same request twice produces the same alias, which keeps the
 * behaviour reproducible and the taskbar readable.
 * @param desk The desktop, for what is already taken.
 * @param base The alias a single window would have had.
 * @returns `base`, or `base#2`, `base#3` and so on.
 */
function freeAlias(desk: DeskView, base: string): string {
  const taken = new Set(desk.getWindows().map((win) => win.app.alias));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}#${n}`)) n += 1;
  return `${base}#${n}`;
}

/**
 * A window already showing this target, if there is one.
 *
 * Two ways to match, and both are needed. The subject is the real one: the user very often already
 * has the thing open in their Content window, and opening a second window onto one document is
 * exactly the conflict the overwrite guard exists to warn about, so causing it here would be
 * perverse. The alias covers the gap the subject leaves, between a window opening and its frame
 * reporting what it loaded.
 * @param desk The desktop to search.
 * @param entityType The entity type wanted.
 * @param unique The key wanted.
 * @returns The window's id, or undefined.
 */
function findOpenTarget(desk: DeskView, entityType: string, unique: string): string | undefined {
  const alias = aliasFor(entityType, unique);
  for (const win of desk.getWindows()) {
    if (win.app.alias === alias) return win.id;
    const shows = desk
      .subjectsOf(win.id)
      .some((subject) => subject.entityType === entityType && subject.unique === unique);
    if (shows) return win.id;
  }
  return undefined;
}

/**
 * Work out what to do when the agent names one of the desktop's own apps.
 *
 * This is the half of the tool no server-side tool could ever cover: the Log Viewer, Background
 * Jobs, Document Types and the rest are places in the backoffice rather than content, and the only
 * thing that knows which of them this user can reach is the desktop's catalogue.
 *
 * Matching is on the **localised** name, because that is the name a person says and the one the
 * describe tool reports; an app's own `name` is usually a manifest label token. Exact wins, then a
 * single containment match (see `name-match.ts`), and anything else is refused rather than
 * guessed. Exactly one match is required here, unlike closing: opening the wrong document wastes
 * the user's attention, while closing the wrong clean window costs a click. The refusal lists
 * what exists, which makes it discovery as well as a refusal: an agent that never called the
 * describe tool still learns the catalogue at the moment it needed it.
 * @param desk The desktop.
 * @param wanted The app name the model passed.
 * @param localise Resolves an app's name.
 * @param newWindow Whether a second window was explicitly asked for.
 * @returns What to do.
 */
function planOpenApp(
  desk: DeskView,
  wanted: string,
  localise: UmbraDesktopLocalise,
  newWindow: boolean,
): OpenWindowPlan {
  const apps = desk.getApps().map((app) => ({ item: app, label: localise(app.name) }));
  const matches = matchByLabel(apps, wanted);

  if (matches.length !== 1) {
    const available = apps.map((entry) => entry.label).join(', ');
    const problem =
      matches.length === 0
        ? `There is no app called "${wanted}" on this desktop.`
        : `"${wanted}" matches more than one app: ${matches.map((entry) => entry.label).join(', ')}.`;
    return {
      kind: 'rejected',
      message: available
        ? `${problem} The apps that can be opened are: ${available}.`
        : `${problem} This desktop has no apps available to open.`,
    };
  }

  const { item: app, label } = matches[0];
  const existing = newWindow
    ? undefined
    : desk.getWindows().find((win) => win.app.alias === app.alias);
  if (existing) {
    return {
      kind: 'focus',
      windowId: existing.id,
      message: `"${label}" was already open on the desktop; that window is now in front.`,
    };
  }
  // The catalogue's own app object, untouched. It already decided this app's URL, its chrome
  // profile and how large it opens, and a second opinion here would drift from the launcher's.
  return {
    kind: 'open',
    app,
    message: `Opened "${label}" in a window on the desktop, beside this chat.`,
  };
}

/**
 * Work out what to do with one tool call.
 *
 * Every refusal is a plan with a sentence rather than a thrown error. The executor does catch a
 * throw and report it to the model, but it also marks the call failed in the chat, and none of
 * these are failures: they are the tool being asked for something it does not do, or being offered
 * in a backoffice that has no desktop.
 * @param desk The desktop hosting the chat, or undefined when the chat is not on one.
 * @param args Whatever the model passed. Unvalidated: it is model output, not a typed call.
 * @returns What to do.
 */
export function planOpenWindow(
  desk: DeskView | undefined,
  args: Record<string, unknown>,
  localise: UmbraDesktopLocalise,
): OpenWindowPlan {
  if (!desk) {
    return {
      kind: 'unavailable',
      message:
        'Not available here: this backoffice is not running inside UmbraDesktop, so there are no windows to open. Answer the user without opening anything, and do not offer to open a window.',
    };
  }

  const app = typeof args.app === 'string' ? args.app.trim() : '';
  const entityType = typeof args.entityType === 'string' ? args.entityType.trim() : '';

  // Both is a misunderstanding rather than a shorthand, and honouring one of them silently would
  // hide it. Neither is the same mistake from the other end.
  if (app && entityType) {
    return {
      kind: 'rejected',
      message:
        'Pass either "app" to open one of the desktop\'s apps, or "entityType" and "unique" to open a content or media item. Not both.',
    };
  }
  const newWindow = args.newWindow === true;
  if (app) return planOpenApp(desk, app, localise, newWindow);
  if (!entityType) {
    return {
      kind: 'rejected',
      message:
        'Nothing to open. Pass "app" with the name of a desktop app, or "entityType" and "unique" to open a content or media item.',
    };
  }
  const openable = OPENABLE[entityType];
  if (!openable) {
    return {
      kind: 'rejected',
      message: `Cannot open "${entityType}" in a window. This tool opens document and media items only.`,
    };
  }

  const unique = typeof args.unique === 'string' ? args.unique.trim() : '';
  if (!unique) {
    return {
      kind: 'rejected',
      message: `Cannot open a ${entityType} without its key. Pass the item's GUID as "unique".`,
    };
  }

  const label = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : entityType;

  const existing = newWindow ? undefined : findOpenTarget(desk, entityType, unique);
  if (existing) {
    return {
      kind: 'focus',
      windowId: existing,
      message: `"${label}" was already open on the desktop; that window is now in front.`,
    };
  }

  const alias = newWindow ? freeAlias(desk, aliasFor(entityType, unique)) : aliasFor(entityType, unique);
  return {
    kind: 'open',
    message: newWindow
      ? `Opened a second window on "${label}". Both windows now show the same ${entityType}, which is exactly the situation UmbraDesktop's overwrite warning is for: saving one after editing the other will overwrite it, and the window with unsaved changes will be marked once the other saves.`
      : `Opened "${label}" in a window on the desktop, beside this chat.`,
    app: {
      alias,
      name: label,
      icon: openable.icon,
      content: { kind: 'iframe', url: backofficeUrl(openable.path(unique)) },
      // One workspace, deep-linked, so the section's tree would be navigation nobody asked for. It
      // is also the profile whose size convention `CONTENT_SIZE` follows.
      chromeProfile: 'workspace-only',
      defaultSize: CONTENT_SIZE,
      minSize: CONTENT_MIN_SIZE,
      // Normally false, so the manager focuses instead of stacking and a repeated call is
      // idempotent even when `findOpenTarget` missed — a race this plan cannot see, since it is
      // computed before the open. A deliberate duplicate has to allow itself, or the manager would
      // undo the very thing that was asked for.
      allowMultiple: newWindow,
    },
  };
}
