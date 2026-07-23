import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Structure-area apps — the content-modelling tree roots that live inside Settings.
 *
 * Document Types and Data Types each register a dedicated **root workspace**
 * (`Umb.Workspace.DocumentType.Root` / `Umb.Workspace.DataType.Root`, entityTypes
 * `document-type-root` / `data-type-root`) reached at the standard
 * `workspace/:entityType` route (`UMB_WORKSPACE_PATH_PATTERN`, core `workspace/paths.ts`).
 * Their tree menu items are `kind: 'tree'`, which `inferUrl` deliberately does not
 * infer (design §5.1), so these use an explicit, hand-verified `url` for the root
 * workspace convention instead of a `ref`.
 *
 * Templates has **no such root workspace** — verified against the installed
 * backoffice (`templating/templates/workspace/manifests.js` registers only the
 * per-template workspace, entityType `template`; no `template-root` workspace exists
 * anywhere in the package). Visiting a guessed `workspace/template-root` URL would
 * render an empty pane (`UmbWorkspaceElement` shows nothing when no workspace
 * manifest matches the entityType) — worse than not curating it. Templates is
 * therefore deliberately left out of the catalogue; it stays reachable by opening the
 * full Settings section app and browsing its tree.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'document-types',
    url: '/umbraco/section/settings/workspace/document-type-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDocumentTypes',
    icon: 'icon-document',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'structure',
    weight: 10,
  },
  {
    alias: 'data-types',
    url: '/umbraco/section/settings/workspace/data-type-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDataTypes',
    icon: 'icon-autofill',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'structure',
    weight: 20,
  },
];
