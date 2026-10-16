import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import { previewTargetFromPath, workspaceViewPathname } from '../preview/preview-target';

/**
 * The pure half of opening a document's workspace view beside its editor (issue #131): which view
 * is offered, the app it opens in, and which attached content is one. The bridge that makes the view
 * run on the owner's workspace is `bridge.ts`, and the element that hosts it is
 * `beside-host.element.ts`. The reasoning is in `docs/design/2026-10-07-workspace-views-beside-design.md`.
 */

/**
 * The part of a `workspaceView` manifest this reads. Third-party JSON, so every field past the alias
 * is optional and read defensively.
 */
export interface UmbraDesktopBesideView {
  /** Always `workspaceView`. */
  type: string;
  /** The view's alias, what the opt-out lists name. */
  alias: string;
  /** The view's kind; the editor kinds are never offered. */
  kind?: string;
  /** The manifest's name, a fallback label. */
  name?: string;
  /** What core's tabs read. */
  meta?: {
    /** The tab's label, a localization token or a literal. */
    label?: string;
    /** The route segment the view is on, after `view/`. */
    pathname?: string;
    /** The tab's icon. */
    icon?: string;
  };
}

/** What the window passes in when it asks whether to offer the view it shows. */
export interface UmbraDesktopBesideOfferInput {
  /** The person's setting (design §7). */
  enabled: boolean;
  /** The owner frame's `location.pathname`. */
  pathname: string;
  /** The view the first split's editor has on screen, as its router rendered it. */
  view: UmbraDesktopBesideView | undefined;
  /** Every alias on the desktop's and the packages' opt-out lists. */
  notBeside: ReadonlySet<string>;
}

/**
 * The workspace view kinds that are editors, which are never offered. An editor beside its own
 * editor is the same form twice, and the collection and tree kinds route inside themselves. Left out
 * by kind rather than by alias (design D4), so a package's editor is covered without anyone listing
 * it: Workflow's view, for one, is a `contentEditor`.
 */
export const UMBRADESKTOP_BESIDE_EDITOR_KINDS: ReadonlySet<string> = new Set([
  'contentEditor',
  'contentTypeDesignEditor',
  'collection',
  'contentCollection',
  'tree',
]);

/**
 * The width a view opens at beside the editor: what Info needs for its two columns, measured in the
 * spike (design §8.1), and the same as the preview's.
 */
export const UMBRADESKTOP_BESIDE_OPEN_WIDTH = 920;

/** What every view's app alias starts with, so this feature's attached content can be found. */
const APP_ALIAS_PREFIX = 'umbradesktop.beside:';

/**
 * Rules 1 to 5 of the offer (design §6): the view the window shows, when it may open beside the
 * editor. Rule 6, that the view holds no router of its own, reads the rendered element and is
 * `holdsRouter` in `frame-views.ts`; the window applies both.
 *
 * The route and the rendered view have to agree. A tab click changes the route a moment before the
 * router renders the new view, and in that moment the view on screen is the previous one, which
 * must not be offered under the new tab's name. Pure.
 * @param input The setting, the route, the view on screen and the opt-out lists.
 * @returns The view to offer, or undefined.
 */
export function besideViewFor(input: UmbraDesktopBesideOfferInput): UmbraDesktopBesideView | undefined {
  const { enabled, pathname, view, notBeside } = input;
  if (!enabled || !view) return undefined;
  if (!previewTargetFromPath(pathname)) return undefined;
  const routed = workspaceViewPathname(pathname);
  if (!routed || view.meta?.pathname !== routed) return undefined;
  if (view.kind && UMBRADESKTOP_BESIDE_EDITOR_KINDS.has(view.kind)) return undefined;
  if (notBeside.has(view.alias)) return undefined;
  return view;
}

/**
 * The two opt-out lists as one set: the desktop's own and every package catalogue's. They only add
 * up, so there is nothing for two packages to disagree about (design §6.1). Pure.
 * @param desktop The desktop's list.
 * @param catalogues The validated package catalogues, each perhaps carrying a list.
 * @returns Every alias that is not offered.
 */
export function mergeNotBeside(
  desktop: ReadonlyArray<string>,
  catalogues: ReadonlyArray<{ workspaceViewsNotBeside?: ReadonlyArray<string> }>,
): Set<string> {
  return new Set([...desktop, ...catalogues.flatMap((c) => c.workspaceViewsNotBeside ?? [])]);
}

/**
 * The app alias a view opens beside the editor under, which is also its kind as attached content:
 * one per view per owner, so asking again for a view already open focuses it (design §2).
 * @param viewAlias The workspace view's alias.
 * @returns The app alias.
 */
export function besideAppAlias(viewAlias: string): string {
  return `${APP_ALIAS_PREFIX}${viewAlias}`;
}

/**
 * Whether an app is a view opened beside its editor.
 * @param alias An app alias.
 * @returns True for this feature's attached content.
 */
export function isBesideAppAlias(alias: string): boolean {
  return alias.startsWith(APP_ALIAS_PREFIX);
}

/** What the host element is told when it opens. */
export type UmbraDesktopBesideProps = {
  /** The document window the view belongs to, whose workspace it runs on. */
  ownerId: string;
  /** The workspace view's manifest alias, built again from the desktop page's registry. */
  viewAlias: string;
};

/**
 * The app a view opens beside the editor in: an element app attached to one document window, never
 * in the launcher. Pure.
 * @param ownerId The document window.
 * @param view The view.
 * @param title The window title, already localized: the view's label and the document's name.
 * @returns The app.
 */
export function createBesideApp(ownerId: string, view: UmbraDesktopBesideView, title: string): UmbraDesktopApp {
  const props: UmbraDesktopBesideProps = { ownerId, viewAlias: view.alias };
  return {
    alias: besideAppAlias(view.alias),
    name: title,
    icon: view.meta?.icon || 'icon-document',
    content: { kind: 'element', element: () => import('./beside-host.element.js'), props },
    chromeProfile: 'bare',
    defaultSize: { w: UMBRADESKTOP_BESIDE_OPEN_WIDTH, h: 700 },
    minSize: { w: 320, h: 300 },
  };
}

/**
 * The ids of every view open beside one window, as panes or floating windows: what turning the
 * setting off closes (design §7). Pure.
 * @param windows The window list.
 * @param ownerId The owner window.
 * @returns Pane ids, then floating window ids.
 */
export function besideContentIds(windows: ReadonlyArray<UmbraDesktopWindow>, ownerId: string): string[] {
  const owner = windows.find((w) => w.id === ownerId);
  const panes = (owner?.panes ?? []).filter((p) => isBesideAppAlias(p.app.alias)).map((p) => p.id);
  const floating = windows.filter((w) => w.owner === ownerId && isBesideAppAlias(w.app.alias)).map((w) => w.id);
  return [...panes, ...floating];
}
