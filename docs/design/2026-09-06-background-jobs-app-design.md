# Background Jobs app — Design

> A **Background Jobs** app for UmbraDesktop: a read-only view of every background job Umbraco has
> registered, showing what each one does, how often it runs, when it last ran, how that run ended
> and when it is next expected. Umbraco offers no such view anywhere in the backoffice, so when
> scheduled publishing stops happening there is currently nothing to look at.

- **Status:** Implemented
- **Date:** 2026-09-06
- **Branch:** `16_background_jobs_app`
- **Issue:** [#16](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/16)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Umbraco runs a set of scheduled jobs behind every site: scheduled publishing, webhook firing, log
scrubbing, temporary file cleanup, telemetry reporting, cache instruction pruning, plus whatever
installed packages register. None of it is visible in the backoffice. This design makes it visible.

**In scope**

- A **Background Jobs** app in the Diagnostics group of the desktop catalogue.
- Both job kinds: **distributed** jobs (claimed by one server across a load-balanced setup) and
  **recurring** jobs (run per server, gated by MainDom and server role).
- Per job: name, kind, status, period, last run, last outcome, next expected run, and server roles
  for recurring jobs.
- In-memory observation of recurring job activity, since Umbraco records none.
- The package's first Management API controller, and the first backend test project.

**Out of scope** — see §13. Most notably any write action: no trigger, pause or cancel.

**This is almost entirely backend.** Unlike the theming design, the global rule *"test-first for all
backend code"* binds directly here, and §11 is written to satisfy it rather than to work around it.

### 1.1 Why not a separate package

The data layer is pure Umbraco core and has nothing desktop-specific about it, which argues for a
standalone package. Against that: a second package means a second release pipeline, README,
marketplace listing and version matrix, to serve demand that has not been observed. That is the
speculative extensibility the catalogue was deliberately designed to avoid.

The resolution is to build it here but keep the seam clean (§9), and to register the UI as a normal
Settings dashboard. That last point matters: **the app appears in the Settings section for everyone,
desktop or not.** Non-desktop users get the tool; the desktop simply windows it with bare chrome
like it does Health Check. Extraction into its own package later stays a file move.

---

## 2. Settled decisions

- **D1 — Read-only.** No trigger, pause or cancel. `IRecurringBackgroundJobTrigger<TJob>` exists
  from 17.5.0 but is not used; see §3.1 for why that is fortunate.
- **D2 — No persistence of recurring runs.** Not a shortcut. A recurring job's schedule restarts
  from its `Delay` on startup, so *next run* is always derived from the current process. A persisted
  *last run* would describe a different timeline from the *next run* beside it, and the row would be
  quietly wrong. Per-instance is the only internally consistent answer.
- **D3 — No server attribution for distributed jobs.** Not possible; see §3.2. `ServerRoles` on
  recurring jobs is offered instead, on those rows only.
- **D4 — Polling, not server events.** Fetch on open, manual refresh, auto-refresh every 5s while
  visible. Server events would mean custom SignalR plumbing for a read-only view.
- **D5 — UI registers as a Settings dashboard**, refed from the catalogue. See §1.1.
- **D6 — Compile against the floor, degrade at runtime.** No bump to the Umbraco version range;
  see §3.1.
- **D7 — Show last outcome, for recurring jobs only.** Succeeded, failed or ignored, captured from
  notifications. **Distributed jobs cannot report an outcome at all** (§3.4), so those rows state
  that rather than showing a misleading blank.
- **D8 — Filter out orphaned distributed rows.** A row whose job is no longer registered is not
  listed. See §6.1 for why leaving them in would actively mislead.

---

## 3. Constraints discovered in the assemblies and core source

Everything in this section was verified against the packages in the local NuGet cache, the
TestInstance database, and the core source in the fork at `D:\github-forks\Umbraco-CMS`. None of it
is inferred from documentation.

### 3.1 The version floor bites

`Directory.Packages.props` pins `[17.0.0,18.0.0)`. **NuGet resolves the lowest version in a range**,
and `project.assets.json` confirms the package compiles against **17.0.0**.

| API | Added in | Compile-available |
| --- | --- | --- |
| `IDistributedJobRepository.GetAll` / `DistributedBackgroundJobModel` | 17.0.0 | yes |
| `DistributedJobSettings.MaximumExecutionTime` | 17.1.0 | **no** |
| `IRecurringBackgroundJobTrigger<TJob>`, `ITriggerableRecurringBackgroundJob` | 17.5.0 | **no** |
| `IDistributedBackgroundJob.AlignToClock` | 17.6.0 | **no** |

Consequences:

- **Stale detection** needs `MaximumExecutionTime`. Rather than raise the floor, read the value from
  configuration, which carries no compile-time dependency:

  ```
  Umbraco:CMS:DistributedJobs:MaximumExecutionTime     default 00:05:00
  ```

  The section is `DistributedJobs`, **plural** (from the `[UmbracoOptions]` attribute), and the
  default comes from `StaticMaxExecutionTime`. Both are easy to get wrong by guessing.

- **`AlignToClock` is ignored.** Only `ScheduledPublishingJob` sets it and its period is 60 seconds.
  Core computes the next aligned boundary as the first multiple of the period, measured in ticks
  from `0001-01-01` UTC, falling strictly after `LastRun` (`DistributedJobService.IsDue`). Using
  `LastRun + Period` instead is wrong by less than one period, so at most 60 seconds. Not worth
  reflection or a floor bump.

- **D1 (read-only) is load-bearing**, not merely a scope choice. A "run now" button would force the
  floor to 17.5.0.

### 3.2 Server attribution is impossible

The table, verified against the TestInstance database:

```
umbracoDistributedJob
  id                int       NOT NULL
  Name              nvarchar  NOT NULL
  lastRun           datetime  NOT NULL
  period            bigint    NOT NULL     -- ticks
  IsRunning         bit       NOT NULL
  lastAttemptedRun  datetime  NOT NULL
```

No server column, no foreign key to `umbracoServer`, and no server property on
`DistributedBackgroundJobModel`. There are also **no notifications for distributed jobs** at all;
the entire notification set is `RecurringBackgroundJob*`. Nothing in Umbraco records which node ran
a distributed job.

It could be recovered by decorating `IDistributedJobService` and noting when `TryTakeRunnableAsync`
returns non-null, but that knowledge lands in that node's memory, so the request must hit the same
node to see it. In the single-server case it tells you nothing; in the load-balanced case it is
mostly blank. Dropped (D3).

### 3.3 The package is missing two things

- `ManagementApiControllerBase`, `VersionedApiBackOfficeRouteAttribute` and `AuthorizationPolicies`
  live in **`Umbraco.Cms.Api.Management`**, which the csproj does not reference. It currently has
  only `Api.Common` and `Core`. This adds a `PackageReference`. Harmless in practice, since
  `Umbraco.Cms` already includes it, but it changes the dependency surface.
- There is **no test project** in the solution. Creating one is part of this work (§11).

### 3.4 Distributed jobs cannot report an outcome

`DistributedBackgroundJobHostedService.RunRunnableJob` calls `FinishAsync` inside a **`finally`**:

```csharp
try     { await job.ExecuteAsync(stoppingToken); }
catch   { _logger.LogError(...); }
finally { await _distributedJobService.FinishAsync(job.Name); }
```

and `FinishAsync` unconditionally writes `LastAttemptedRun = LastRun = utcNow`, `IsRunning = false`.

**A distributed job that throws therefore leaves the row byte-identical to one that succeeded.**
There is no failure count, no error column, and no notification. The only record of the failure is
the log entry. The `LastAttemptedRun` / `LastRun` pair, which looks like a success indicator, only
diverges *while a job is in flight*: `TryTakeRunnableAsync` sets `LastAttemptedRun` and `IsRunning`
on claim, and `FinishAsync` brings both back into line on completion.

This is why D7 is scoped to recurring jobs. Anything else would be invention.

---

## 4. Architecture

```
Umbraco.Community.UmbraDesktop/
  BackgroundJobs/                         no desktop or catalogue dependency
    IBackgroundJobReportService
    BackgroundJobReportService            merges both sources
    RecurringJobActivityCache             singleton, in-memory
    Notifications/
      RecurringJobActivityHandler         INotificationHandler x4
      RecurringJobActivityCacheStartupHandler   forces the cache into existence at boot (§7)
    Models/
      BackgroundJobStatus, BackgroundJobKind, BackgroundJobState,
      BackgroundJobOutcome, RecurringJobActivity
  Api/
    BackgroundJobsController              one GET
    Handlers/                             existing scaffolding, finally wired up
  Composing/
    BackgroundJobsComposer                services, handlers, OpenAPI doc
```

`BackgroundJobReportService` depends only on `IEnumerable<IDistributedBackgroundJob>`,
`IDistributedJobRepository`, `ICoreScopeProvider`, `IEnumerable<IRecurringBackgroundJob>`,
`RecurringJobActivityCache`, `IConfiguration` and `TimeProvider`. Every one is an interface or a
fakeable type, so it unit-tests with no host. `TimeProvider` is not optional: next run and staleness
are both clock arithmetic and the tests must control the clock.

---

## 5. Data model

```csharp
/// <summary>Which scheduling mechanism a job is registered with.</summary>
public enum BackgroundJobKind { Distributed, Recurring }

/// <summary>What a job is doing at the moment the report was built.</summary>
public enum BackgroundJobState { Idle, Running, Stale, Manual }

/// <summary>How a job's most recent observed run ended.</summary>
/// <remarks>Always <c>Unavailable</c> for distributed jobs; Umbraco records no outcome (§3.4).</remarks>
public enum BackgroundJobOutcome { Unavailable, NotObserved, Succeeded, Failed, Ignored }

/// <summary>A single background job as presented to the backoffice.</summary>
public record BackgroundJobStatus(
    string Name,
    string TypeName,
    BackgroundJobKind Kind,
    BackgroundJobState State,
    BackgroundJobOutcome LastOutcome,
    TimeSpan? Period,                    // null when Manual
    DateTimeOffset? LastRun,             // null = not observed this instance
    DateTimeOffset? NextRun,             // null = cannot be determined
    IReadOnlyList<string> ServerRoles);  // empty for distributed

/// <summary>The full report, including the point from which recurring activity is known.</summary>
public record BackgroundJobReport(
    DateTimeOffset MonitoringSince,
    IReadOnlyList<BackgroundJobStatus> Jobs);
```

`Manual` covers `Timeout.InfiniteTimeSpan`, which `IRecurringBackgroundJob.Period` explicitly
supports to mean "scheduled runs disabled, manual trigger only". Rendering that as a period would
produce a nonsense duration.

`Unavailable` and `NotObserved` are deliberately distinct. The first means Umbraco cannot tell us
(every distributed job, always); the second means we have simply not seen a run yet on this
instance. Collapsing them into one value would misrepresent the first as the second.

---

## 6. The two merge paths

### 6.1 Distributed

Join `IEnumerable<IDistributedBackgroundJob>` (definitions) to `IDistributedJobRepository.GetAll()`
(state) on `Name`, inside an `ICoreScopeProvider` scope.

- `NextRun` = `LastRun + Period`.
- `State` = `Stale` when `IsRunning` and `now - LastAttemptedRun > Period + MaximumExecutionTime`,
  else `Running` when `IsRunning`, else `Idle`.
- `LastOutcome` = `Unavailable`, always (§3.4).
- `ServerRoles` is empty.

**The stale threshold is `Period + MaximumExecutionTime`, not `MaximumExecutionTime`.** That is
core's own reclaim condition in `DistributedJobService.TryTakeRunnableAsync`:

```csharp
x.IsRunning is false || x.LastAttemptedRun < utcNow - x.Period - _settings.MaximumExecutionTime
```

Using the shorter threshold would flag jobs as stale while Umbraco still considers them healthy and
will not reclaim them, which is exactly the kind of confident wrongness this app exists to avoid.

**Orphaned rows are filtered out (D8),** and the reason is stronger than tidiness. When
`TryTakeRunnableAsync` claims a row whose job is not registered, it has *already* written
`IsRunning = true` and updated `LastAttemptedRun` before discovering the job is missing. It then
logs a warning and returns null, so `RunRunnableJob` returns early and **never calls `FinishAsync`**.
The row is left running forever, and will read as `Running` and then permanently `Stale`. Listing it
would show a phantom job stuck in a failure state. `EnsureJobsAsync` deletes unregistered rows, so
this self-heals on the next application start; the window in which it can appear is between a
package being uninstalled and the next restart.

**`LastRun` is populated at registration, not first run.** `EnsureJobsAsync` inserts new jobs with
`LastRun = LastAttemptedRun = utcNow`, identical to what a successful run writes, so the two are
indistinguishable. On a fresh install every job reads as having run at install time. *Next run*
remains correct, because that is exactly when it will first fire. Not worth working around; worth
knowing.

### 6.2 Recurring

Join `IEnumerable<IRecurringBackgroundJob>` (definitions) to `RecurringJobActivityCache` (state) on
the job's CLR type. The interface has **no** `Name`, so the type name is both key and label.

- `NextRun` = `later(LastRun, LastAttempt) + Period` when either has been observed, otherwise
  `MonitoringSince + Delay`.
- `Period` or `Delay` of `Timeout.InfiniteTimeSpan` maps to `Manual` with a null `NextRun`.
- `LastOutcome` from the cache, or `NotObserved`.
- `ServerRoles` from `IRecurringBackgroundJob.ServerRoles`.

**`NextRun` is derived from the later of `LastRun` and `LastAttempt`, not `LastRun` alone.** A code
review caught a real defect in the original design: `RecordIgnored` deliberately never sets
`LastRun` (being skipped is not a run), but `NextRun` was pinned to `MonitoringSince + Delay`
forever for a job that is *always* skipped. That is not exotic:
`IRecurringBackgroundJob.DefaultServerRoles` is `[Single, SchedulingPublisher]`, so every recurring
job that does not override `ServerRoles` is skipped on every Subscriber node in a load-balanced
install, permanently. After three days of uptime the recurring section would read "next run: 3 days
ago" on every such node, telling operators the jobs were hung when they were being correctly skipped
on schedule. The fix is a second field on the cache entry, `LastAttempt`, stamped by both
`RecordExecuting` and `RecordIgnored` (§7), with `NextRun` derived from whichever of `LastRun` and
`LastAttempt` is later.

**Why the later of the two, not always `LastAttempt`.** Core counts the period from the previous
run's *completion* when a run actually completed, so `LastRun` wins in that case. For a skipped or
still-in-flight tick there is no completion, so the attempt time is the only basis available, and it
is what the timer actually uses. One behavioural consequence follows from this: for a job currently
in flight, `NextRun` now reads `LastAttempt + Period` rather than the previous completion plus
period. That is deliberate, not a regression. The old value could sit in the past while the job was
demonstrably running, which is a worse lie than a `NextRun` that moves later while a run is under
way.

**Recurring next run is approximate and the UI must not imply otherwise.** Some jobs let
configuration shift their first run via a cron expression through `DelayCalculator`, and
`IRecurringBackgroundJob` does not expose that.

---

## 7. The activity cache

A singleton holding one immutable `RecurringJobActivity` record per job type in a
`ConcurrentDictionary`, replaced atomically on each update. `MonitoringSince` is captured on
construction and is what the window footer reports.

**The singleton must be constructed eagerly, not on first resolution.** A plain DI singleton is
built lazily, the first time something resolves it. That moment could be whenever someone first
opens the dashboard, which would make `MonitoringSince` and the "Monitoring since" footer report
when the dashboard was opened rather than when observation began. `RecurringJobActivityCacheStartupHandler`,
an `INotificationHandler<UmbracoApplicationStartingNotification>` whose constructor takes the cache,
forces construction during boot. The class does nothing at runtime; its only job is that constructor
dependency, so nobody should delete it as dead code (§4).

| Notification | Effect |
| --- | --- |
| `RecurringBackgroundJobExecutingNotification` | mark running, stamp `LastAttempt` |
| `RecurringBackgroundJobExecutedNotification` | clear running, `LastRun` + `Succeeded` |
| `RecurringBackgroundJobFailedNotification` | clear running, `LastRun` + `Failed` |
| `RecurringBackgroundJobIgnoredNotification` | stamp `LastAttempt`, record `Ignored`, leave `LastRun` untouched |

`Ignored` earns its place: on a replica, jobs restricted to Master fire it repeatedly, so a row can
explain that the job is being skipped on this server rather than showing an unexplained blank. It
does **not** update `LastRun`, because being skipped is not a run. It does update `LastAttempt`
(§6.2), because the schedule still fired and that tick is what `NextRun` must be counted from.

There is no fifth row for cancellation. The original design specified a
`RecurringBackgroundJobCanceledNotification` handler and a `Cancelled` outcome; neither exists.
Umbraco 17.0.0 ships `Executing`, `Executed`, `Failed`, `Ignored`, `Starting`, `Started`, `Stopping`
and `Stopped`, and the abstract base; `Canceled` was added later, somewhere between 17.4 and 17.6.
The design was written from 17.6.2 documentation by mistake. It was dropped rather than raising the
version floor, and the reason is stronger than compatibility: the cache is in-memory and dies with
the process. A cancellation notification only fires during shutdown, so a `Cancelled` outcome would
be written to a cache about to be destroyed and could never be read by anyone. It is unreachable by
construction on every version, not just this one (§13).

---

## 8. API

```
GET /umbraco/management/api/v1/umbradesktop/background-jobs
```

The segment is `umbradesktop` without a hyphen because `backoffice/scripts/generate-openapi.js`
filters the spec on the path prefix `/umbraco/management/api/v1/umbradesktop`, and a mismatch
silently produces an empty client. `ManagementApiControllerBase` already carries
`[MapToApi(ManagementApiConfiguration.ApiName)]`, so the endpoint joins the existing management
Swagger document and no custom document is needed.

```csharp
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/background-jobs")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public class BackgroundJobsController(IBackgroundJobReportService reportService)
    : ManagementApiControllerBase
```

This is the first consumer of the OpenAPI client toolchain in this package, so the generation script
and the scaffolded `OperationIdHandler` / `SchemaIdHandler` get wired into a composer for the first
time. The generated client's service class is `UmbraDesktopService`, driven by the
`GroupName = "UmbraDesktop"` above, with the method `getBackgroundJobs()`.

---

## 9. Module layout & the seam

The rule that keeps extraction cheap: **nothing under `BackgroundJobs/` may reference the desktop,
the catalogue, or anything in `backoffice/src/desktop/`.** It talks to Umbraco core abstractions and
nothing else. `Api/` and `Composing/` may depend on it; it depends on neither.

Frontend:

- A dashboard element under `backoffice/src/dashboards/`, registered in the package manifest, with
  its pure formatting and grouping logic beside it in `background-jobs-format.ts` so that the part
  worth testing is testable without a browser (§11).
- A catalogue entry in `backoffice/src/desktop/catalogue/diagnostics.ts`, `chromeProfile: 'bare'`,
  alongside Health Check and Profiling.
- Localisation keys in the existing localization files.

---

## 10. UI

> Revised after seeing the first build against a real install. §10.1 records what the first
> version got wrong and why; the description below is the shipped design.

Two tables, one per kind. Each kind is a `uui-box`: the heading and job count sit in the box header,
the sentence explaining that kind is the first thing inside it, and the table follows. The table
carries no border of its own, because the box is already the frame. A short intro above the boxes
states what the screen is and that it is read-only.

Neither the intro nor the group notes are width-limited. A measure cap is right for prose a reader
works through; here it only left a ragged column of text beside a wide table, which read as unrelated
to it.

**Distributed** carries Name, Every, Last run, Next run. **Recurring** carries Name, Every, Last
run, Outcome, Next run, Runs on.

Decisions that hold the layout together:

- **The kinds are separate tables because they can answer different questions.** Umbraco records
  nothing about how a distributed run ended (§3.4) and distributed jobs carry no server roles, so
  those two columns exist only for the recurring table. The distributed heading's note says
  "Umbraco does not record how a run ended" once, in a sentence, rather than as an identical cell
  on every row.
- **There is no Kind column**, because the grouping is the kind.
- **Outcome is a glyph**, with its wording as tooltip and accessible name: a green check for
  Succeeded, a red alert for Failed, a grey skip for Ignored, and an en dash for Unavailable and
  NotObserved. The two absent cases get a dash rather than a glyph because a glyph would overstate
  them; the dash is never the only thing that says so, since the group note and the tooltip both do.
  A **legend sits with the recurring group's explanation**, above the table rather than below it,
  because that is where a reader meets the glyphs. It is built by calling the row renderer itself
  rather than by listing the glyphs a second time, so it cannot drift from what the rows draw, and
  its glyphs are marked decorative there since the wording is already beside them.
- **Status is a badge beside the job name, and idle renders nothing.** Almost every row is idle at
  any moment, so a column for it would spend width to report that nothing is happening. Running,
  Stale and Manual are the states worth seeing and now stand out more than they did as plain text.
- **A recurring job that lists every `ServerRole` reads "Any server".** All four roles spelled out
  is four words for "no restriction". A job that is genuinely restricted lists its roles, which is
  the case that matters on a load-balanced install.
- **Times are relative, with the absolute moment on hover.** "in 24 seconds" answers "is this due
  soon, or is it stuck" without arithmetic against the wall clock; the exact time is what you need
  only when correlating against a log. This is why the view re-renders once a second while the
  poll stays at five: a countdown that only moves every fifth second reads as broken.
- **A next run within one poll interval of now reads "Due now"** rather than counting down through
  zero. See §10.2: the clock is live but the data behind it is not, and a countdown rendered faster
  than its data refreshes will announce a *next* run in the past. Past that window the lateness is
  real rather than an artefact of polling, so an overdue run keeps counting up and a stuck job
  stays visible.
- **The refresh interval is the reader's to set**: 1, 5 or 10 seconds, defaulting to 10, with no
  "off". See §10.3.
- **Rows keep the order the API sent them.** The client does not re-sort.

A recurring job with no observed run reads **"Not since restart"**, never "Never". The footer
carries "Monitoring since {time}", which is what makes an empty *last run* self-explanatory rather
than ambiguous.

The intro and the interval picker share one row, intro left and picker right, the picker centred
against the paragraph rather than pinned to its top edge. They belong together: the picker's label
states how often the screen is refreshing, which is part of explaining what you are looking at.

**There is no manual refresh button.** The view refreshes on its own at least every ten seconds, and
in a desktop window the chrome carries a refresh control already, so a third one said nothing. This
holds for the plain Settings dashboard too, where there is no window chrome: the auto-refresh is
what makes the button redundant, not the chrome.

Short jobs will usually be caught between runs rather than mid-run: `WebhookFiring` runs every 10
seconds and completes in milliseconds, so `Running` will rarely be seen. That is honest behaviour
and should not be presented as a fault.

### 10.3 The refresh interval is the reader's to set

Refresh rate is a dropdown of **1, 5 and 10 seconds, defaulting to 10**, built from `umb-dropdown`
and `uui-menu-item` so it matches the Log Viewer's polling control rather than inventing an
affordance. Choosing one takes effect immediately rather than after the previous, slower interval
finishes elapsing. The choice lives for as long as the view does; the Log Viewer's does the same.

**There is deliberately no "off".** The screen is built out of live countdowns, and per §10.2 the
tolerance that stops a next run counting past zero *is* the refresh interval. With nothing
refreshing there is no defensible tolerance and every relative time drifts without bound, so "off"
would have to mean freezing the clock as well — a second rendering mode for a view whose entire
subject is what is happening right now.

That the tolerance follows the setting is the point rather than a detail. At 10 seconds a job with a
5-second period reads "Due now" permanently, which is the truth: it is always about to run and the
view cannot see finer than its own refresh. Drop to 1 second and the same job counts down properly,
because now the view can.

One timer drives both the clock and the poll, the poll firing once the chosen interval has elapsed
in ticks, so a countdown can never be rendered out of phase with the data it counts down to. That
makes every offered interval necessarily a whole multiple of the clock tick, which §11 asserts.

### 10.1 What the first version got wrong

The first build was one table of eight columns, one row per job, sorted by kind then name. It was
correct and nearly unreadable, and the reason is worth recording: **on a real install most of its
columns were constant.**

| Column | What ten of fourteen rows actually said |
| --- | --- |
| Kind | `Distributed`, in one unbroken block, because the table was already sorted by it |
| Status | `Idle`, on every row |
| Outcome | `Not recorded by Umbraco`, on every distributed row |
| Server roles | an en dash on every distributed row, and `Unknown, Single, Subscriber, SchedulingPublisher` on every recurring one |

Four of eight columns carried no per-row information at all, and between them they took more width
than the job names. Repetition on that scale is not a styling problem to be tightened, it is a
signal that the value belongs somewhere other than a cell: in a group heading, in a glyph, in a
badge that only appears when it has something to say, or in a single sentence of prose. That is the
whole of the change above.

The lesson generalises past this screen: **a column is worth its width only if rows disagree about
it.** It cannot be judged from the data model, where every one of those four columns looks
essential. It only shows up against real data, which is why this pass happened after the first
working build rather than in the original design.

### 10.2 A live clock over data that is not live

Moving to relative times introduced a defect of its own, found the same way: `InstructionProcessJob`
runs every 5 seconds and read **"Next run: 2 seconds ago"**.

The clock advances every second so that countdowns move, but the report behind it is a snapshot up
to one poll interval old. A countdown rendered faster than its data refreshes therefore runs past
zero and starts describing a *next* run in the past. It is worst exactly where it is most visible:
a job whose period is at or below the poll interval is genuinely always imminent, so it spends most
of its time in the overshoot.

The same staleness shows in the other direction, and is not a defect: a job with a 5-second period
can legitimately report a last run 9 seconds ago, because the run it did 4 seconds ago is not in
our copy of the report yet. That number is true of the data we hold, and the footer states the
refresh rate, so the screen is not claiming otherwise.

The fix follows from naming the limit: **the view cannot resolve anything finer than its refresh
interval, so it should not pretend to.** A next run within one interval of now — either side —
reads "Due now", because the run may already have happened without this snapshot knowing. Beyond
that window the lateness is real, so the relative time returns and a stuck job still stands out.

The tolerance is the poll interval itself rather than a tuned constant, so it stays correct if the
interval changes. `describeNextRun` in `background-jobs-format.ts` holds the rule, and takes the
tolerance as an argument rather than importing it, which is what makes it testable.

---

## 11. Testing

New xUnit project, `src/Umbraco.Community.UmbraDesktop.Tests`, added to the solution. Test-first per
the global .NET rules: tests were written and failing before the corresponding implementation
existed. **33 tests**, verified with `dotnet test src/Umbraco.Community.UmbraDesktop.Tests`, across
four classes:

`BackgroundJobReportServiceDistributedTests`

- Next run from last run plus period.
- `Running` when `IsRunning` and inside the reclaim window.
- `Stale` only once past `Period + MaximumExecutionTime`; still `Running` at exactly that boundary,
  and still `Running` just inside it. **Explicitly asserts the boundary is `Running`, not `Stale`**,
  since the shorter threshold (`MaximumExecutionTime` alone) is the intuitive mistake.
- `MaximumExecutionTime` absent from configuration falls back to `00:05:00`.
- `LastOutcome` is `Unavailable` regardless of row state.
- A row with no registered job behind it is absent from the report (D8).
- `scope.Complete()` is called on the `ICoreScopeProvider` scope.
- Both kinds merged into one report, distributed rows sorted first.
- Server roles are empty for distributed rows.
- Every distributed timestamp in these tests is fed with `DateTimeKind.Unspecified`, matching what
  `IDistributedJobRepository.GetAll()` actually returns from the database; a test built on
  `DateTimeKind.Utc` values would not have caught a bug in how those are interpreted.

`BackgroundJobReportServiceRecurringTests`

- Next run from observed run plus period.
- Unobserved job takes next run from `MonitoringSince + Delay`, null last run, and `NotObserved`.
- Infinite `Period` yields `Manual` with a null next run.
- Infinite `Delay` yields a null next run until observed.
- `Running` takes precedence over `Manual`.
- Server roles are carried through.
- **A job skipped on every tick still advances its next run**, written failing first against the
  §6.2 defect: a job restricted to another server role, ticked every 5 minutes for 72 hours of
  `Ignored` notifications, must report `NextRun` one period after the last skipped tick, not pinned
  to `MonitoringSince + Delay` from three days earlier.
- **A completed run takes precedence over the attempt** for `NextRun`: when a run starts and then
  completes, the next run counts from the completion timestamp, not the moment it started.
- Each outcome maps through from the cache.

`RecurringJobActivityCacheTests`

- Executing then a completion produces a finished run with the right outcome, not a running one.
- Executing with no completion leaves the job running.
- Failed clears the running flag and sets the outcome (parameterised the same way for every terminal
  outcome).
- Ignored sets the outcome but does **not** advance `LastRun`, including for a job that has never run
  at all.
- A later notification overwrites an earlier one for the same job type.
- A new execution preserves the previous run's `LastRun` and `LastOutcome` while it is in flight, so
  the UI does not blank a job's history the moment it starts running again.
- **Every tick stamps `LastAttempt`, and a completion leaves it alone**: `RecordExecuting` and
  `RecordIgnored` both stamp it, `RecordCompleted` does not move it.
- `MonitoringSince` is fixed at construction.

`RecurringJobActivityHandlerTests`

- Each of the four notification handlers (`Executing`, `Executed`, `Failed`, `Ignored`) drives the
  cache the way §7 describes.

All of it runs against a controlled `TimeProvider` and faked collections. No host, no database.

The frontend suite runs separately: `npm run test` executes 259 tests under `@web/test-runner`.

Thirty of those were added with the §10 revision, test-first, in two files:

`dashboards/background-jobs/background-jobs-format.test.ts` covers the arithmetic that the redesign
introduced, which is the part of a presentation layer worth testing because it can be silently
wrong:

- `formatPeriod` at each unit boundary.
- `toRelativeTime` picking the coarsest unit with a magnitude of at least one, and **rounding by
  magnitude rather than with `Math.round`**: `Math.round(-1.5)` is `-1` while `Math.round(1.5)` is
  `2`, so a job 90 seconds overdue and one due in 90 seconds would otherwise be described as
  different distances from now.
- A distance that rounds up out of its unit (59.5 minutes becoming 60) reported in the next unit up,
  never as "60 minutes".
- `describeNextRun` reporting "due" across the whole tolerance window including both edges, counting
  down normally beyond it, and **still reporting a genuinely overdue run as past** so a stuck job is
  not hidden by the same rule that hides polling noise. One test sweeps every second across the
  window and asserts none of them produces a countdown, which is the §10.2 defect stated directly.
- `runsOnAnyServer` true only for the complete role set, order-independent, false for a restricted
  job and for one declaring no roles.
- `groupJobsByKind` preserving the server's order, and putting an unrecognised kind in the recurring
  table rather than dropping it, since `kind` crosses the wire as a string precisely so that adding
  one server-side is not breaking.
- The offered refresh intervals (§10.3): the default is one of them, or the picker renders with
  nothing selected; each is a whole multiple of the clock tick, or the poll fires on an Nth tick
  that never arrives and the view silently stops refreshing; and they are listed fastest first.

`desktop/localization/parity.test.ts` guards the two hand-maintained localization files against each
other: identical key sets, no empty terms, and the same `%n%` placeholders in both languages. The
key count went 82 → 90 in this pass, and a key added to one file and forgotten in the other renders
in the backoffice as its own raw token.

The element itself has no render test. Its remaining logic is term lookup and template assembly over
the tested functions above, and the failure modes that survive (a wrong icon name, an unclear
sentence) are ones a test would not catch and a look at the screen would.

---

## 12. Risks

- **Recurring next run is approximate** where cron configuration is in play (§6.2).
- **Compiling against 17.0.0 while running against later 17.x.** The configuration-reading approach
  in §3.1 is deliberately version-agnostic, but any future use of a post-17.0 API needs the same
  care or a floor bump.
- **Core's reclaim condition is the source of truth for `Stale` (§6.1).** If it changes in a later
  17.x, this app's threshold silently drifts from core's. The test named in §11 documents the
  intent, but nothing detects upstream change automatically.

Two risks from the first draft have since been resolved by reading the core source, and are recorded
in §6.1 rather than here: `EnsureJobsAsync` does prune unregistered rows, and `LastRun` is
confirmed to be populated at registration time.

---

## 13. Out of scope

- Any write action: trigger, pause, cancel, reschedule (D1).
- Persisting recurring job history (D2).
- Which server ran a distributed job (D3).
- Outcome or failure history for distributed jobs — impossible, not deferred (§3.4).
- `IBackgroundTaskQueue` depth or contents. It exposes only `QueueBackgroundWorkItem` and
  `DequeueAsync`; there is nothing to read.
- Run duration and history charts.
- Clock-aligned next run for `AlignToClock` jobs (§3.1).
- Extracting `BackgroundJobs/` into a standalone package (§1.1).
- A `Cancelled` outcome and its notification handler. Not merely absent from 17.0.0: unreachable by
  construction on every version, since a cancellation notification only fires during shutdown and
  this cache does not outlive the process (§7).
