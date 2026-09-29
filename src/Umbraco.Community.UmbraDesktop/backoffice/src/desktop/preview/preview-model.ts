import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopPreviewTarget } from './preview-target';

/**
 * The pure half of the preview: what its app is, which preview options a site offers, and when it
 * has to reload. The element in `preview.element.ts` does the fetching and drawing.
 */

/**
 * The preview's app alias, which is also its kind as an attached window: one preview per document
 * window, and asking again focuses the one already open.
 */
export const UMBRADESKTOP_PREVIEW_APP_ALIAS = 'umbradesktop.preview';

/**
 * The URL provider the Save and preview button asks for by default, `umbDocumentUrlProvider`. A
 * headless site overrides the provider behind this alias, which is why using it is enough to open
 * that site's own front-end preview.
 */
export const UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER = 'umbDocumentUrlProvider';

/** The workspace action every preview option hangs off in core. */
const SAVE_AND_PREVIEW_ACTION = 'Umb.WorkspaceAction.Document.SaveAndPreview';

/** Core's label for its own preview option, a localization token. */
const DEFAULT_PREVIEW_LABEL = '#buttons_saveAndPreview';

/**
 * The content widths the preview's device buttons set, in px: the narrowest common phone viewport,
 * a portrait tablet, and a laptop. Conventions rather than measurements, named once so the buttons
 * and anything describing them read the same numbers.
 */
export const UMBRADESKTOP_PREVIEW_WIDTHS = { phone: 375, tablet: 768, desktop: 1280 } as const;

/**
 * The content width a preview opens at: what Umbraco's own preview page needs before the buttons in
 * its footer are cut off, which is the backoffice's own working width. Measured in a browser on
 * 2026-09-27 at about 920. A headless front-end may be happy narrower, which is why this is where it
 * opens and not its minimum.
 */
export const UMBRADESKTOP_PREVIEW_OPEN_WIDTH = 920;

/** What the preview window's body is told when it opens. */
export type UmbraDesktopPreviewProps = {
  /** The document window the preview is attached to. */
  ownerId: string;
  /** The document and variant to preview. */
  target: UmbraDesktopPreviewTarget;
};

/**
 * The app a preview opens in: an element app, attached to one document window, which is never in
 * the launcher because it means nothing without a document.
 *
 * It opens at {@link UMBRADESKTOP_PREVIEW_OPEN_WIDTH}, the width Umbraco's own preview page holds
 * together at, and can be narrowed to a phone's for a front-end that works there. On a desktop too
 * narrow for the document and a preview that wide side by side, it opens floating instead.
 * Pure.
 * @param ownerId The document window it belongs to.
 * @param target The document and variant to preview.
 * @param title The window title, already localized with the document's name in it.
 * @returns The app.
 */
export function createPreviewApp(ownerId: string, target: UmbraDesktopPreviewTarget, title: string): UmbraDesktopApp {
  const props: UmbraDesktopPreviewProps = { ownerId, target };
  return {
    alias: UMBRADESKTOP_PREVIEW_APP_ALIAS,
    name: title,
    icon: 'icon-eye',
    content: { kind: 'element', element: () => import('./preview.element.js'), props },
    chromeProfile: 'bare',
    defaultSize: { w: UMBRADESKTOP_PREVIEW_OPEN_WIDTH, h: 700 },
    minSize: { w: 320, h: 300 },
  };
}

/** One way to preview a document, as the Save and preview button offers it. */
export interface UmbraDesktopPreviewOption {
  /** The URL provider alias to ask the server for. */
  providerAlias: string;
  /** Its label, a localization token or a literal. */
  label: string;
}

/** The part of a `workspaceActionMenuItem` manifest this reads. */
interface PreviewOptionManifest {
  kind?: unknown;
  weight?: number;
  forWorkspaceActions?: unknown;
  meta?: unknown;
}

/**
 * A preview option's meta, when the manifest has the shape of one. Core types `meta` per kind, and
 * the registry hands every kind over at once, so the shape is checked here rather than trusted.
 * @param meta A manifest's `meta`.
 * @returns The provider alias and label, or undefined when it names no provider.
 */
function optionMeta(meta: unknown): { urlProviderAlias: string; label?: string } | undefined {
  const candidate = meta as { urlProviderAlias?: unknown; label?: unknown } | undefined;
  if (typeof candidate?.urlProviderAlias !== 'string' || !candidate.urlProviderAlias) return undefined;
  return {
    urlProviderAlias: candidate.urlProviderAlias,
    label: typeof candidate.label === 'string' ? candidate.label : undefined,
  };
}

/**
 * The preview options a site registers, in the order the Save and preview button lists them.
 *
 * Every `previewOption` menu item under Save and preview is one: core registers its own, and a site
 * or package adds more, each naming the URL provider it asks for. Read from the same manifests the
 * button reads, so the preview offers exactly what the button offers. Umbraco's own option is always
 * there as the fallback, so a registry that has not loaded yet still gives a working preview. Pure.
 * @param manifests The registered `workspaceActionMenuItem` manifests.
 * @returns The options, heaviest first, never empty.
 */
export function previewOptions(manifests: ReadonlyArray<PreviewOptionManifest>): UmbraDesktopPreviewOption[] {
  const options = manifests
    .filter((m) => m.kind === 'previewOption' && [m.forWorkspaceActions ?? []].flat().includes(SAVE_AND_PREVIEW_ACTION))
    .map((m) => ({ weight: m.weight ?? 0, meta: optionMeta(m.meta) }))
    .filter((m): m is { weight: number; meta: { urlProviderAlias: string; label?: string } } => !!m.meta)
    .sort((a, b) => b.weight - a.weight)
    .map((m) => ({ providerAlias: m.meta.urlProviderAlias, label: m.meta.label ?? m.meta.urlProviderAlias }));
  return options.length
    ? options
    : [{ providerAlias: UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER, label: DEFAULT_PREVIEW_LABEL }];
}

/**
 * Whether a preview URL is this backoffice's own preview page, which refreshes itself.
 *
 * Umbraco's preview page listens on its preview hub and reloads its own frame when the document is
 * saved, so the desktop reloading it as well is a second refresh, and not a harmless one: replacing
 * the page closes its hub connection, and the page announces that as a "connection lost" warning in
 * the moment before it goes. So the desktop leaves that page to refresh itself and reloads only the
 * previews that cannot, which are a headless site's front-end.
 *
 * Matched as the backoffice's own `preview` route under its own base, not as any path that ends in
 * `preview`, because an ordinary page of the site can be called that too. Pure.
 * @param url The preview URL, absolute.
 * @param backofficeBase This backoffice's base URL, `document.baseURI` in the backoffice.
 * @returns True for the backoffice's own preview page.
 */
export function previewRefreshesItself(url: string, backofficeBase: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(backofficeBase);
    if (target.origin !== base.origin) return false;
    const path = target.pathname.replace(/\/$/, '');
    return path === `${base.pathname.replace(/\/$/, '')}/preview`;
  } catch {
    return false;
  }
}

/** What of the owner window the reload decision reads. */
type OwnerState = Pick<UmbraDesktopWindow, 'saves' | 'changedElsewhere' | 'dirty'>;

/**
 * Whether the preview has to reload, given how its owner window changed.
 *
 * The preview shows the saved version, so it reloads when that changes and at no other time. Two
 * signals cover every way it can. The saves count moves on the editor's own save or publish, and on
 * a clean window's silent refresh after a colleague saved. A window with unsaved changes is not
 * refreshed when a colleague saves, so there the server-event router raising `changedElsewhere` is
 * the only sign the saved version moved. Typing changes neither, which is the point: a preview that
 * reloaded per keystroke would show nothing new and flicker. Pure.
 * @param previous The owner as it was.
 * @param next The owner as it is now.
 * @returns True when the preview should reload.
 */
export function previewReloadNeeded(previous: OwnerState, next: OwnerState): boolean {
  if ((previous.saves ?? 0) !== (next.saves ?? 0)) return true;
  return !previous.changedElsewhere && !!next.changedElsewhere;
}
