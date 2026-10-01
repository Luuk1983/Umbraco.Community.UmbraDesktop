---
id: commercial-packages
title: Commercial packages
description: The apps you get for Umbraco's commercial packages, and what happens to other sections.
sidebar_position: 3
---

# Commercial packages

The desktop knows Umbraco's eight commercial packages by name. Each gets proper apps, with the right
name, icon, group and window chrome, instead of a generic tile. There is nothing to configure: an app
appears only on sites that have that package.

| Package | What you get | Where it lands |
| --- | --- | --- |
| Umbraco Forms | The Forms section | Editing |
| Umbraco Workflow | The Workflow section, plus Workflow tasks, Workflow search and Release sets as their own windows | Workflow |
| Umbraco Deploy | Deploy and Deploy environments on v17; Deploy status, schema and configuration on v18 | Synchronisation |
| Umbraco Commerce | The Commerce section | Marketing and sales |
| Umbraco Engage | The Engage section, and Engage configuration | Marketing and sales, System |
| Umbraco UI Builder | The UI Builder settings workspace | Development |
| Umbraco Automate | The Automate section | Automation |
| Umbraco AI | The AI section, and the Copilot Workspace as its own chat window | AI |

Most of these are a single app on purpose. Commerce, Engage and UI Builder navigate internally in ways
that have no stable link to point a tile at: Commerce scopes everything to a store, Engage uses its
own screen system, and UI Builder generates its sections from its configuration at runtime. So the
section opens with its own sidebar and does the navigating itself.

UI Builder's generated sections still appear on their own, under More, as any section the desktop
does not know does.

Two Workflow apps only show when they apply to you. Workflow search and Release sets both check your
Workflow permissions, and Release sets also checks whether the feature is switched on. Rather than
show a tile that opens an empty window, the desktop asks first.

## Other packages

Some community packages are known too. uSync, for example, gets an app in the Synchronisation group
that opens its whole workspace without the Settings tree beside it. A site that runs uSync in its own
section instead gets uSync as an ordinary app under More.

## Sections the desktop does not know

Any section a user can reach that no catalogue entry covers still shows up, under **More**, with a
generic icon and the full section in its window. Nothing is hidden just because it has not been
curated. A package can give its own screens proper tiles; see
[Package catalogues](../../developer/package-catalogues.md) in the developer guide.
