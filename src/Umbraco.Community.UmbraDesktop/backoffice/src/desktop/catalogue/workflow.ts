import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Workflow — the administrator's section, plus the three tools it puts in *Content*.
 *
 * The split is by audience. The Workflow section is where an administrator manages approval groups
 * and reads history, and its four menu items are all reachable from its own sidebar, so it opens
 * `full-section` and gets no per-tool tiles. The three dashboards below are aimed at the editor and
 * live in the Content section, where they are otherwise buried behind its dashboard tab strip —
 * exactly the case `bare` exists for. All four now share their own `workflow` group rather than
 * Editing: four entries would otherwise swamp Editing's three core apps, and the audience split
 * described above is unaffected — it just now happens within one group instead of spilling into it.
 *
 * None declares a `section`: a dashboard's gate is derived from its own `Umb.Condition.SectionAlias`,
 * which for all three names Content.
 *
 * Two carry conditions beyond that, and both are answerable from the desktop — one reads the current
 * user's workflow permissions, the other a server setting. Neither depends on where the extension is
 * mounted, so evaluating them here just saves opening an empty window. The `Umb.Condition.SectionAlias`
 * beside them is *not* listed, and must not be: it is answered relative to the mount point, and the
 * iframe is the thing mounted in Content.
 *
 * Workflow also registers a content-calendar dashboard in its source. It is commented out and never
 * reaches the registry, so it has no entry here.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'workflow',
    ref: 'Umb.Section.Workflow',
    // Label is `#workflow_workflow`; the package translates it.
    icon: 'icon-stamp',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'workflow',
    weight: 10,
  },
  {
    // The editor's own dashboard: my tasks, my submissions. Its label is `#workflow_workflow`,
    // identical to the section's, so an inherited name would give two tiles called "Workflow".
    alias: 'workflow-tasks',
    ref: 'workflow.editor.dashboard',
    name: '#umbraDesktop_appWorkflowTasks',
    icon: 'icon-checkbox-dotted-active',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'workflow',
    weight: 20,
  },
  {
    alias: 'workflow-search',
    ref: 'Workflow.AdvancedSearch.Dashboard',
    // Inherited label is `#workflow_search_advancedSearch` ("Advanced search"), which says nothing
    // about Workflow on a flat tile.
    name: '#umbraDesktop_appWorkflowSearch',
    icon: 'icon-document-search',
    evaluateConditions: ['Workflow.Condition.UserPermission'],
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'workflow',
    weight: 30,
  },
  {
    alias: 'workflow-release-sets',
    ref: 'Workflow.ReleaseSets.Dashboard',
    name: '#umbraDesktop_appWorkflowReleaseSets',
    icon: 'icon-calendar',
    // Release sets are a feature you switch on, so the setting condition is the one that matters:
    // without it this tile would appear on every install and open empty on most.
    evaluateConditions: ['Workflow.Condition.UserPermission', 'Workflow.Condition.SettingEnabled'],
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'workflow',
    weight: 40,
  },
];
