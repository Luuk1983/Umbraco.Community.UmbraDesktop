import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';

/**
 * Turns the desk into the paragraph the agent reads when it asks what the desktop is.
 *
 * Pure, and separated from the tool that publishes it, because everything worth getting right here
 * is in the wording rather than in the plumbing.
 */

/**
 * What a snapshot needs of the desktop: two answers from the window manager, one from the app
 * catalogue.
 *
 * A structural interface rather than the two context types, so a test can build a desk without a
 * controller host, and so this module cannot quietly start using more of them than it says.
 * `host-desk.ts` is what assembles the real one.
 */
export interface DeskView {
  /** The open windows, in list order. */
  getWindows(): ReadonlyArray<UmbraDesktopWindow>;
  /**
   * What one window is showing.
   * @param id The window.
   */
  subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject>;
  /** Everything this user could open, in launcher order. */
  getApps(): ReadonlyArray<UmbraDesktopApp>;
}

/**
 * Resolve an app's name into something a person, or a model, can read.
 *
 * Needed because an app's `name` is usually a localisation token and not a word: a curated
 * catalogue entry inherits it from the referenced manifest's label, so the Content editor is
 * `#umbraDesktop_appContentEditor` and the Copilot Workspace is `#uaiCopilotWorkspace_sectionLabel`.
 * The window element resolves those when it paints a titlebar, and nothing resolved them on the way
 * to the agent until this existed.
 */
export type UmbraDesktopLocalise = (text: string) => string;

/**
 * One window as a line of prose.
 * @param win The window.
 * @param subjects What it is showing, which is empty for a Log Viewer or a dashboard.
 * @param localise Resolves the app's name.
 * @returns The line, without its leading bullet.
 */
function describeWindow(
  win: UmbraDesktopWindow,
  subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>,
  localise: UmbraDesktopLocalise,
): string {
  const parts: string[] = [localise(win.app.name)];
  if (win.active) parts.push('in front');
  if (win.state === 'minimized') parts.push('minimized');
  // Identity and nothing else, deliberately. Reading the document is the agent's job and it has
  // server-side tools that work whether or not the thing is open, so repeating content here would
  // be a second, staler copy of something it can already fetch — while the key is the one thing it
  // cannot derive from "the page I have open".
  for (const subject of subjects) {
    parts.push(`showing ${subject.entityType} ${subject.unique}`);
  }
  // Last, so it is the note the line ends on.
  if (win.dirty) parts.push('has unsaved changes');
  return parts.join(', ');
}

/**
 * Describe the desktop right now, or nothing when there is no desktop.
 *
 * A snapshot rather than a subscription, and that is the whole design of it: what the agent is told
 * is true of the moment it asked, and stays in the transcript saying so. A live reference would
 * silently change what a two-hour-old conversation meant, which fails in the least reproducible way
 * available.
 *
 * Prose rather than JSON, which is not laziness either. It began life as ambient per-message
 * context, where the server discards an item's structured half unless a backend contributor
 * recognises its shape and this package ships none; as a tool result the model reads it directly,
 * and sentences are what it reads best.
 * @param desk The desktop hosting the chat, or `undefined` when the chat is not on one.
 * @param localise Resolves an app's name, which is usually a localisation token. Required rather
 *   than defaulted to pass-through, because a caller who forgets reintroduces the exact bug this
 *   parameter exists for and the result still looks plausible.
 * @returns The description, or `undefined` when there is no desktop to describe.
 */
export function describeDesk(
  desk: DeskView | undefined,
  localise: UmbraDesktopLocalise,
): string | undefined {
  if (!desk) return undefined;
  const windows = desk.getWindows();
  const parts: string[] = [
    'The user is working in UmbraDesktop, a windowed desktop inside the Umbraco backoffice.',
  ];

  if (windows.length === 0) {
    // Still worth saying, and it is the commonest first question. It tells the agent the desktop is
    // there, which is what makes offering to open something a sensible thing to do rather than a
    // guess.
    parts.push('No windows are open.');
  } else {
    const count = windows.length === 1 ? '1 window' : `${windows.length} windows`;
    parts.push(`${count} open:`);
    parts.push(
      ...windows.map((win) => `- ${describeWindow(win, desk.subjectsOf(win.id), localise)}`),
    );
  }

  // What the desktop *can* do, not only what it currently is. Without this the agent knows the desk
  // and not the desktop: it cannot offer to open the Log Viewer, and it cannot turn a name the user
  // said out loud into something openable. The list is already gated by the user's permissions, so
  // naming an app here never promises something they cannot reach.
  const apps = desk.getApps().map((app) => localise(app.name));
  if (apps.length > 0) {
    parts.push(`Apps that can be opened in a window: ${apps.join(', ')}.`);
  }

  return parts.join('\n');
}
