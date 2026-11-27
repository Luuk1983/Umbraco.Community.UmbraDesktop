# Umbraco 19 rc2

Date: 2026-11-27. Against Umbraco 19.0.0-rc2, .NET SDK 11.0.100. Follows
[the rc1 doc](2026-11-19-umbraco-19-rc1-design.md). This is the first change on `main` as the 19 line
(#219), and it comes before our own first release candidate, `v19.0.0-rc.1`.

## 1. The move

- `UmbraDesktopUmbracoFloor` and every frontend's `@umbraco-cms/backoffice` pin: `19.0.0-rc2`. UUI:
  `2.2.1`, core's lock at `release-19.0.0-rc2` (Umbraco-CMS#24729).
- `Microsoft.AspNetCore.OpenApi` and EF Core stay at 11.0.0, which is what rc2 requires too.
- Test instance:
  - Advanced Permissions moves from `19.0.0-beta.1` to `19.0.0-rc.1`, which requires rc2.
  - The starter kit has no rc2 and Umbraco.AI no rc.2. Their rc1 and rc.1 allow rc2, so they stay.
  - **Engage is back.** Its rc2 is built against CsvHelper 34, like Workflow and UI Builder, which
    ends the split that made it fail at boot on rc1 (rc1 doc §3). Forms' rc1 still names 33.1 and
    boots on 34, as before.
- The docs that name the floor say rc2. The add-on developer docs' NuGet ranges, which the rc1 doc
  left at `19.0.0-beta.1`, now start at `19.0.0-rc.1`, the tag this change is for.

## 2. What changed in core between rc1 and rc2

51 commits, most of them server fixes (search, content types, published cache, SQL Server, SQLite).
None of the server ones touches anything we call. The ones that reach our code:

| Change | Does it affect us |
|---|---|
| The sign-in popup no longer closes itself. The window that opened it closes it when the `authorized` broadcast arrives (#24761) | The lock screen opens core's popup through the top window's `UmbAuthContext.makeAuthorizationRequest(…, false, …)`. That same context now holds the popup and closes it, so the lock screen works the same way. Nothing in our code closed or watched the popup |
| The security stamp is re-validated on schedule for sessions renewed by activity (#24682) | Server side. A disabled account or a password changed elsewhere now ends a busy desktop's session within the validation interval, where before it could go unnoticed. That is core's intent, and the lock screen is how the desktop shows it |
| A user stays signed in on their own device after changing their own password (#24721) | Changing your password in a desktop window no longer ends the session the other windows share |
| `UmbEntityItemRefFrameMixin` puts the base class's styles last (#24584) | We don't use the mixin |
| `truncateString` in `@umbraco-cms/backoffice/utils` | New, nothing to do |
| UUI 2.2.0 to 2.2.1 | Pin moved, see §1 |

Nothing was deprecated or removed between the two that we use. `tsc` against rc2 confirms the types.

## 3. Checked

- `pnpm run build` (`tsc` included) and `pnpm test` in all six packages against the rc2 backoffice:
  host 3267, Services.Arcade 208, Services.Media 375, Entertainment 684, Accessories 459, Media 1066
  passed, none failed.
- The four C# test projects on .NET 11, each by its project file: 307, 33, 115 and 87 passed.
- The test instance on rc2, with Engage, from a blank database. Engage loads: no CsvHelper or type
  load error, and its migrations run. Headless Chrome signed in, granted the Desktop section and
  loaded the desktop: every desktop element rendered, the welcome wizard showed, and the console had
  no error or warning.

**A blank database fails its first boot, and that is not rc2's doing.** The starter kit publishes its
content during the unattended install, before Umbraco Commerce's own migration has run, and
Commerce's price cache handler (`InvalidateAdjustedPriceCacheOnContentPublish`) throws a null
reference on that publish. The second boot runs Commerce's migration and comes up clean. A copied
database never hits it. Worth reporting to Umbraco Commerce if it survives 19.0.0.

Not covered: the lock screen's sign-in popup in a browser. It needs a session that ends while the
desktop is open, and §2 is why it should behave the same.
