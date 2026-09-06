// This registers Background Jobs as an ordinary Settings dashboard, not something
// desktop-only: the tool is available to every backoffice user who can reach Settings,
// with the desktop catalogue (see desktop/catalogue/diagnostics.ts) simply refing this
// alias and windowing it with bare chrome.
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'dashboard',
    alias: 'Umbraco.Community.UmbraDesktop.Dashboard.BackgroundJobs',
    name: 'Background Jobs Dashboard',
    element: () => import('./background-jobs/background-jobs.element.js'),
    weight: -10,
    meta: {
      label: '#umbraDesktop_appBackgroundJobs',
      pathname: 'background-jobs',
    },
    conditions: [
      {
        alias: 'Umb.Condition.SectionAlias',
        match: 'Umb.Section.Settings',
      },
    ],
  },
];
