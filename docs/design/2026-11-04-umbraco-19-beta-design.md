# Umbraco 19 beta (issue #196)

Date: 2026-11-04. Against Umbraco 19.0.0-beta1, .NET SDK 11.0.100-rc.3.26522.148.

## 1. Goal and branch

A first UmbraDesktop beta on Umbraco 19, to see how much the move costs and to find Umbraco 19 bugs
early enough to report them. Not new development: only the "Must change" list in #196, plus two
cheap "Should change" items (the cookie note in the docs and a first window-open measurement).

The work lives on `v19/main`, not `main`. This breaks the branch-per-major rule on purpose and for
now: 17 and 18 are under active development, so `main` stays 18 until 19 settles, and then `v19/main`
becomes `main`. The feature branch is `feature/196-umbraco-19-beta`, with its own database.

## 2. What it cost

Small. The packages compiled against 19 with no change to shipped C#. Everything else:

| Change | Why |
|---|---|
| net11.0, floor `19.0.0-beta1`, ceiling `19.99999999`, MinVer minimum 19.0 | the move itself |
| `global.json` pins the .NET 11 SDK; CI reads it (`global-json-file`) | .NET 11 is still a release candidate |
| EF Core and `Microsoft.AspNetCore.OpenApi` at `11.0.0-rc.3.26522.148` | what 19.0.0-beta1 requires |
| Test instance: `Umbraco.Cms 19.*-*`, uSync `19.*-*`, Advanced Permissions `19.0.0-beta.1` | a plain `19.*` admits no prerelease |
| Commercial packages and Umbraco AI switched off in the test instance | none has a 19 release yet |
| Media variants lose `segment` (Media and Services.Media) | 19 removed it from `MediaVariantRequestModel` and `UmbEntityVariantModel` |
| `UmbTemporaryFileConfigRepository.initialized` is gone; `part()` now waits for the config itself | 19 reworked config repositories onto `UmbConfigRepositoryBase` |
| Examine Management app points at core's Search screen (`Umb.MenuItem.SearchRoot`), renamed Search Indexes | the Examine dashboard is gone in 19 (Umbraco-CMS#23321) |
| Test fakes: `IRecurringBackgroundJob.IgnoredDelay`, `IgnoredDelayChanged`; `ServerInformation(..., isDebugMode)` | 19 dropped the interface defaults and added a constructor argument |
| Remote viewer shim: comments describe the cookie, not a bearer header | 19 signs in with a plain cookie |

The Examine app keeps its alias, `examine-management`, so pins and saved layouts from 18 keep working.

`AppIconSetFactory` needed nothing for ImageSharp 4: it only builds URLs through `IImageUrlGenerator`.
Resized media was checked in the running instance (73 image requests, none failed).

## 3. What was run

- `npm run build` and `npm test` in all six frontends: 4,971 tests, none failing.
- All four C# test projects: 542 tests, none failing.
- Pack of all six packages as `19.0.0-beta.1`; the floor check resolves every backoffice import in
  19.0.0-beta1, and the add-on ranges are `[19.0.0-beta.1, 19.99999999.0]`.
- A real 19 backoffice (database upgraded from 18 on first boot, clean log), driven headless:
  - every one of the 48 launcher apps opened; every iframe app rendered its view, every element app
    rendered (screenshots checked by eye);
  - lock screen with a two-minute session: core's warning shows once, the desktop locks at two
    minutes, and signing in again through 19's popup unlocks it with the window still on its page;
  - agency connections: the instance connected to itself through an API user, status `Ok`, version
    `19.0.0-beta1`, and a document tree read through the proxy.

## 4. Window open time

Click to a rendered backoffice view inside the window, five opens each, warm: Content 881, 822, 690,
594, 592 ms; Log Viewer 721, 718, 707, 721, 647 ms. There is no 18 number measured the same way yet,
so these are the baseline, not a comparison.

## 5. Umbraco 19 findings

No Umbraco 19 bug found yet that affects UmbraDesktop. Noted along the way:

- **uSync 19.0.0-beta01's SignalR hub is not mapped.** `POST /umbraco/SyncHub/negotiate` answers 404,
  while core's own hub at `/umbraco/serverEventHub` answers 401 (so it exists). uSync's screen loses
  its live progress. uSync's issue, not core's or ours; candidate report to uSync.
- **A user who has signed in cannot be deleted** (`CannotDeleteUserWithLoginHistory`), only disabled.
  Deliberate in 19, but it means a throwaway API user stays behind as a disabled user.
- Tree items in 19 carry `variants[].id`, all zeros for the invariant variant. Not used by us; noted
  in case it turns out to matter.

## 6. Not done

- The "Should change" refactors in #196 (`userEntryPoint`, simplifying the session code).
- The catalogue's commercial entries and the AI chat are untested on 19 until those packages ship.
- An 18 window-open measurement to compare §4 against.
