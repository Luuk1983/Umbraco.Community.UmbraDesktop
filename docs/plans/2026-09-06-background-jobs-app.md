# Background Jobs App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only Background Jobs app listing every background job Umbraco has registered, with its kind, status, period, last run, last outcome, next expected run and server roles.

**Architecture:** A `BackgroundJobs/` layer with no desktop dependency merges two sources: distributed jobs from the database via `IDistributedJobRepository`, and recurring jobs from DI joined to an in-memory cache fed by Umbraco's notifications. A single Management API `GET` exposes the merged report; a Settings dashboard renders it and the desktop catalogue refs that dashboard.

**Tech Stack:** .NET 10, Umbraco CMS 17 (compiled against 17.0.0), xUnit + NSubstitute, Lit + TypeScript, `@hey-api/openapi-ts`.

**Design:** [`docs/design/2026-09-06-background-jobs-app-design.md`](2026-09-06-background-jobs-app-design.md)

---

## Working agreements

- **Never commit.** The standard plan format ends each task with a commit; the global rule in
  `~/.claude/rules/version-control.md` overrides it. Tasks end at a **review checkpoint**: stop,
  report what changed, and wait. Luuk commits.
- **Test-first is mandatory** for all backend code (global .NET rules). Write the test, watch it
  fail, then implement. The only exception is types with no behaviour (enums, plain records),
  called out explicitly where it applies.
- **C# conventions** (global .NET rules): primary constructors, `var` for locals, `record` over
  `class` unless reference semantics are needed, and XML docs on **every** type, method and
  property regardless of accessibility. `GenerateDocumentationFile` is on, so gaps warn.
- Run all commands from the worktree root: `D:\github\Umbraco.Community.UmbraDesktop\Worktrees\16_background_jobs_app`.

### Amendment to the design

The design gives the route as `umbra-desktop/background-jobs`. **It must be `umbradesktop/background-jobs`.**
`backoffice/scripts/generate-openapi.js` filters the spec on `desiredPathPrefix = '/umbraco/management/api/v1/umbradesktop'`,
and a hyphen there would produce an empty client. Design §8 to be corrected in Task 14.

Also confirmed while planning: `ManagementApiControllerBase` already carries
`[MapToApi(ManagementApiConfiguration.ApiName)]`, so the endpoint lands in the existing **management**
Swagger document. No custom Swagger document or `ConfigureOptions` is needed.

---

## File structure

**Milestone 1 — test project**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj` | Test project |
| `src/Directory.Packages.props` | Central versions for the four test packages |
| `Umbraco.Community.UmbraDesktop.app.slnx` | Register the test project |

**Milestone 2 — the domain layer** (all under `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/`)

| File | Responsibility |
| --- | --- |
| `Models/BackgroundJobKind.cs` | Distributed vs recurring |
| `Models/BackgroundJobState.cs` | Idle / Running / Stale / Manual |
| `Models/BackgroundJobOutcome.cs` | How the last observed run ended |
| `Models/BackgroundJobStatus.cs` | One job as presented |
| `Models/BackgroundJobReport.cs` | The full report plus `MonitoringSince` |
| `Models/RecurringJobActivity.cs` | What has been observed for one recurring job |
| `RecurringJobActivityCache.cs` | In-memory store, singleton |
| `Notifications/RecurringJobActivityHandler.cs` | Five notifications into the cache |
| `IBackgroundJobReportService.cs` | The one method the API needs |
| `BackgroundJobReportService.cs` | Merges both sources |

**Milestone 3 — API**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.UmbraDesktop/Api/ViewModels/BackgroundJobResponseModel.cs` | Wire shape for one job |
| `src/Umbraco.Community.UmbraDesktop/Api/ViewModels/BackgroundJobReportResponseModel.cs` | Wire shape for the report |
| `src/Umbraco.Community.UmbraDesktop/Api/BackgroundJobsController.cs` | `GET` |
| `src/Umbraco.Community.UmbraDesktop/Composing/BackgroundJobsComposer.cs` | DI + notification handlers |
| `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj` | `Umbraco.Cms.Api.Management` reference |
| `src/Directory.Packages.props` | Version for it |

**Milestone 4 — UI**

| File | Responsibility |
| --- | --- |
| `backoffice/src/dashboards/background-jobs/background-jobs.element.ts` | The table |
| `backoffice/src/dashboards/manifest.ts` | Register the dashboard |
| `backoffice/src/desktop/catalogue/diagnostics.ts` | Catalogue entry |
| `backoffice/src/desktop/localization/en.ts`, `nl.ts` | Strings |

---

# Milestone 1 — Test project

### Task 1: Create the test project

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj`
- Create: `src/Umbraco.Community.UmbraDesktop.Tests/BuildSanityTests.cs`
- Modify: `src/Directory.Packages.props`
- Modify: `Umbraco.Community.UmbraDesktop.app.slnx`

- [ ] **Step 1: Add the test package versions**

Central package management is on (`ManagePackageVersionsCentrally=true`), so versions live here and
the csproj carries no `Version` attributes. Add inside the existing `<ItemGroup>` of
`src/Directory.Packages.props`:

```xml
    <!-- Test dependencies -->
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="18.9.0" />
    <PackageVersion Include="xunit" Version="2.9.3" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="3.1.5" />
    <PackageVersion Include="NSubstitute" Version="5.3.0" />
```

- [ ] **Step 2: Create the test project file**

`src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <!-- The global XML-doc rule applies to tests too, by explicit decision. -->
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
    <PackageReference Include="xunit" />
    <PackageReference Include="xunit.runner.visualstudio" />
    <PackageReference Include="NSubstitute" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Umbraco.Community.UmbraDesktop\Umbraco.Community.UmbraDesktop.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 3: Add one sanity test**

`src/Umbraco.Community.UmbraDesktop.Tests/BuildSanityTests.cs`:

```csharp
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests;

public class BuildSanityTests
{
    [Fact]
    public void TestProjectReferencesThePackage()
    {
        var assembly = typeof(Api.Handlers.PackageOperationIdHandler).Assembly;
        Assert.Equal("Umbraco.Community.UmbraDesktop", assembly.GetName().Name);
    }
}
```

- [ ] **Step 4: Register the project in the solution**

Add to `Umbraco.Community.UmbraDesktop.app.slnx`, after the existing package project line:

```xml
  <Project Path="src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj" />
```

- [ ] **Step 5: Restore and run**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: `Passed! - Failed: 0, Passed: 1`

`RestorePackagesWithLockFile` is on in `src/Directory.Build.props`, so this also generates
`src/Umbraco.Community.UmbraDesktop.Tests/packages.lock.json`. That file is expected and should be
kept.

- [ ] **Step 6: 🚦 Review checkpoint**

Stop. Report: the four new package versions, the csproj, the sanity test, the solution entry, and
the generated lock file. Do not commit.

---

# Milestone 2 — The domain layer

### Task 2: The model types

No tests: these are enums and positional records with no behaviour, so there is nothing to assert
that the compiler does not already enforce. Behaviour arrives in Task 3.

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/BackgroundJobKind.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/BackgroundJobState.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/BackgroundJobOutcome.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/RecurringJobActivity.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/BackgroundJobStatus.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Models/BackgroundJobReport.cs`

- [ ] **Step 1: `BackgroundJobKind.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// Which scheduling mechanism a background job is registered with.
/// </summary>
public enum BackgroundJobKind
{
    /// <summary>
    /// Claimed by a single server across a load-balanced setup. State is stored in the
    /// <c>umbracoDistributedJob</c> table and therefore survives a restart.
    /// </summary>
    Distributed,

    /// <summary>
    /// Runs on each server independently, gated by MainDom and server role. Umbraco stores nothing
    /// about these, so their state is only what this application instance has observed.
    /// </summary>
    Recurring,
}
```

- [ ] **Step 2: `BackgroundJobState.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// What a background job is doing at the moment the report was built.
/// </summary>
public enum BackgroundJobState
{
    /// <summary>Not executing. A next run is scheduled.</summary>
    Idle,

    /// <summary>Executing right now.</summary>
    Running,

    /// <summary>
    /// Marked as running for longer than Umbraco tolerates, so it is eligible to be reclaimed by
    /// another server. Usually means the server running it died mid-job. Distributed jobs only.
    /// </summary>
    Stale,

    /// <summary>
    /// Automatic scheduling is disabled (an infinite period), so the job only runs when triggered.
    /// Recurring jobs only.
    /// </summary>
    Manual,
}
```

- [ ] **Step 3: `BackgroundJobOutcome.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// How a background job's most recent observed run ended.
/// </summary>
public enum BackgroundJobOutcome
{
    /// <summary>
    /// Umbraco records no outcome for this kind of job, so nothing can be reported. Always the
    /// value for distributed jobs: <c>FinishAsync</c> is called from a <c>finally</c> and writes
    /// the same row whether the job succeeded or threw.
    /// </summary>
    Unavailable,

    /// <summary>No run has been observed since this application instance started.</summary>
    NotObserved,

    /// <summary>The last observed run completed without throwing.</summary>
    Succeeded,

    /// <summary>The last observed run threw.</summary>
    Failed,

    /// <summary>
    /// The last scheduled run was skipped without executing, for example because of the server
    /// role, MainDom, or the runtime not being ready.
    /// </summary>
    Ignored,

    /// <summary>The last observed run was cancelled, typically by application shutdown.</summary>
    Cancelled,
}
```

- [ ] **Step 4: `RecurringJobActivity.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// What has been observed about a single recurring background job since this application instance
/// started.
/// </summary>
/// <param name="IsRunning">
/// True between an executing notification and the notification that completes it.
/// </param>
/// <param name="LastRun">
/// When the most recent completed run finished, or <see langword="null"/> if none has been observed.
/// A skipped run does not set this, because being skipped is not a run.
/// </param>
/// <param name="LastOutcome">How the most recent observed run or skip ended.</param>
public record RecurringJobActivity(
    bool IsRunning,
    DateTimeOffset? LastRun,
    BackgroundJobOutcome LastOutcome);
```

- [ ] **Step 5: `BackgroundJobStatus.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// A single background job as presented to the backoffice.
/// </summary>
/// <param name="Name">
/// Display name. The registered name for distributed jobs; the CLR type name for recurring jobs,
/// which have no name of their own.
/// </param>
/// <param name="TypeName">Full CLR type name, used as the stable identity across refreshes.</param>
/// <param name="Kind">Which scheduling mechanism registered the job.</param>
/// <param name="State">What the job is doing right now.</param>
/// <param name="LastOutcome">How the last observed run ended.</param>
/// <param name="Period">
/// How often the job is scheduled, or <see langword="null"/> when scheduling is disabled.
/// </param>
/// <param name="LastRun">
/// When the job last ran, or <see langword="null"/> when no run has been observed this instance.
/// </param>
/// <param name="NextRun">
/// When the job is next expected to run, or <see langword="null"/> when that cannot be determined.
/// Approximate for recurring jobs whose first run is shifted by cron configuration.
/// </param>
/// <param name="ServerRoles">
/// The server roles the job is permitted to run on. Empty for distributed jobs, which carry no
/// role restriction.
/// </param>
public record BackgroundJobStatus(
    string Name,
    string TypeName,
    BackgroundJobKind Kind,
    BackgroundJobState State,
    BackgroundJobOutcome LastOutcome,
    TimeSpan? Period,
    DateTimeOffset? LastRun,
    DateTimeOffset? NextRun,
    IReadOnlyList<string> ServerRoles);
```

- [ ] **Step 6: `BackgroundJobReport.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// Every background job Umbraco has registered, plus the point from which recurring activity is
/// known.
/// </summary>
/// <param name="MonitoringSince">
/// When this application instance began observing recurring jobs. Without it, an empty last-run
/// column is ambiguous between "never ran" and "not seen yet".
/// </param>
/// <param name="Jobs">The jobs, ordered by kind then name.</param>
public record BackgroundJobReport(
    DateTimeOffset MonitoringSince,
    IReadOnlyList<BackgroundJobStatus> Jobs);
```

- [ ] **Step 7: Build**

Run: `dotnet build src/Umbraco.Community.UmbraDesktop -v q`
Expected: `Build succeeded` with 0 warnings. Any CS1591 warning means a missing XML doc comment.

- [ ] **Step 8: 🚦 Review checkpoint**

Stop. Report the six model files. Do not commit.

---

### Task 3: `RecurringJobActivityCache`

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/RecurringJobActivityCache.cs`
- Test: `src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/RecurringJobActivityCacheTests.cs`

- [ ] **Step 1: Write the failing tests**

`src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/RecurringJobActivityCacheTests.cs`:

```csharp
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

public class RecurringJobActivityCacheTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    private sealed class FakeJob;

    private static (RecurringJobActivityCache Cache, FakeTimeProvider Time) Create()
    {
        var time = new FakeTimeProvider(Start);
        return (new RecurringJobActivityCache(time), time);
    }

    [Fact]
    public void MonitoringSince_IsFixedAtConstruction()
    {
        var (cache, time) = Create();

        time.Advance(TimeSpan.FromHours(3));

        Assert.Equal(Start, cache.MonitoringSince);
    }

    [Fact]
    public void Get_ReturnsNull_WhenNothingObserved()
    {
        var (cache, _) = Create();

        Assert.Null(cache.Get(typeof(FakeJob)));
    }

    [Fact]
    public void RecordExecuting_MarksRunning_WithNoLastRun()
    {
        var (cache, _) = Create();

        cache.RecordExecuting(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.True(activity.IsRunning);
        Assert.Null(activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.NotObserved, activity.LastOutcome);
    }

    [Fact]
    public void RecordCompleted_ClearsRunning_AndStampsLastRun()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        time.Advance(TimeSpan.FromSeconds(30));

        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.False(activity.IsRunning);
        Assert.Equal(Start.AddSeconds(30), activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
    }

    [Theory]
    [InlineData(BackgroundJobOutcome.Failed)]
    [InlineData(BackgroundJobOutcome.Cancelled)]
    public void RecordCompleted_ClearsRunning_ForEveryTerminalOutcome(BackgroundJobOutcome outcome)
    {
        var (cache, _) = Create();
        cache.RecordExecuting(typeof(FakeJob));

        cache.RecordCompleted(typeof(FakeJob), outcome);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.False(activity.IsRunning);
        Assert.Equal(outcome, activity.LastOutcome);
    }

    [Fact]
    public void RecordIgnored_SetsOutcome_ButDoesNotAdvanceLastRun()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);
        var ranAt = cache.Get(typeof(FakeJob))!.LastRun;
        time.Advance(TimeSpan.FromMinutes(10));

        cache.RecordIgnored(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.Equal(BackgroundJobOutcome.Ignored, activity.LastOutcome);
        Assert.Equal(ranAt, activity.LastRun);
        Assert.False(activity.IsRunning);
    }

    [Fact]
    public void LaterNotifications_OverwriteEarlierOnes_ForTheSameType()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Failed);
        time.Advance(TimeSpan.FromMinutes(1));

        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
        Assert.Equal(Start.AddMinutes(1), activity.LastRun);
    }
}
```

`FakeTimeProvider` comes from `Microsoft.Extensions.TimeProvider.Testing`. Add it in the same style
as Task 1: `<PackageVersion Include="Microsoft.Extensions.TimeProvider.Testing" Version="9.10.0" />`
in `src/Directory.Packages.props`, and `<PackageReference Include="Microsoft.Extensions.TimeProvider.Testing" />`
in the test csproj.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: compile error, `The type or namespace name 'RecurringJobActivityCache' could not be found`.

- [ ] **Step 3: Implement**

`src/Umbraco.Community.UmbraDesktop/BackgroundJobs/RecurringJobActivityCache.cs`:

```csharp
using System.Collections.Concurrent;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Holds what has been observed about recurring background jobs since this application instance
/// started.
/// </summary>
/// <remarks>
/// Umbraco persists nothing about recurring jobs and exposes no run state, so notifications are the
/// only source and this cache is the only place that state exists. It is deliberately not
/// persisted: a recurring job's schedule restarts from its delay on startup, so a last run carried
/// over from a previous process would describe a different timeline from the next run beside it.
/// </remarks>
/// <param name="timeProvider">Clock used to stamp completed runs and the monitoring start.</param>
public sealed class RecurringJobActivityCache(TimeProvider timeProvider)
{
    private readonly ConcurrentDictionary<Type, RecurringJobActivity> _activity = new();

    /// <summary>
    /// Gets the moment this cache began observing, which is effectively application start.
    /// </summary>
    public DateTimeOffset MonitoringSince { get; } = timeProvider.GetUtcNow();

    /// <summary>
    /// Records that a job has begun executing.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    public void RecordExecuting(Type jobType)
        => _activity.AddOrUpdate(
            jobType,
            _ => new RecurringJobActivity(true, null, BackgroundJobOutcome.NotObserved),
            (_, existing) => existing with { IsRunning = true });

    /// <summary>
    /// Records that a job stopped executing, stamping the completion time as its last run.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    /// <param name="outcome">How the run ended.</param>
    public void RecordCompleted(Type jobType, BackgroundJobOutcome outcome)
        => _activity[jobType] = new RecurringJobActivity(false, timeProvider.GetUtcNow(), outcome);

    /// <summary>
    /// Records that a scheduled run was skipped without executing.
    /// </summary>
    /// <remarks>
    /// Deliberately leaves the last run untouched. Being skipped is not a run, and overwriting it
    /// would erase the only evidence that the job has ever done anything on this server.
    /// </remarks>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    public void RecordIgnored(Type jobType)
        => _activity.AddOrUpdate(
            jobType,
            _ => new RecurringJobActivity(false, null, BackgroundJobOutcome.Ignored),
            (_, existing) => existing with
            {
                IsRunning = false,
                LastOutcome = BackgroundJobOutcome.Ignored,
            });

    /// <summary>
    /// Gets what has been observed for a job type.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    /// <returns>The observed activity, or <see langword="null"/> if nothing has been seen.</returns>
    public RecurringJobActivity? Get(Type jobType)
        => _activity.TryGetValue(jobType, out var activity) ? activity : null;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: `Passed! - Failed: 0, Passed: 9`

- [ ] **Step 5: 🚦 Review checkpoint**

Stop. Report the cache, its tests, and the added test-time package. Do not commit.

---

### Task 4: `RecurringJobActivityHandler`

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Notifications/RecurringJobActivityHandler.cs`
- Test: `src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/RecurringJobActivityHandlerTests.cs`

- [ ] **Step 1: Write the failing tests**

`src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/RecurringJobActivityHandlerTests.cs`:

```csharp
using Microsoft.Extensions.Time.Testing;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Sync;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

public class RecurringJobActivityHandlerTests
{
    private sealed class FakeRecurringJob : IRecurringBackgroundJob
    {
        public TimeSpan Period => TimeSpan.FromMinutes(5);

        public TimeSpan Delay => TimeSpan.FromMinutes(1);

        public TimeSpan IgnoredDelay => TimeSpan.FromMinutes(1);

        public ServerRole[] ServerRoles => [ServerRole.Single];

        public event EventHandler? PeriodChanged { add { } remove { } }

        public event EventHandler? IgnoredDelayChanged { add { } remove { } }

        public Task RunJobAsync() => Task.CompletedTask;
    }

    private static (RecurringJobActivityHandler Handler, RecurringJobActivityCache Cache, FakeRecurringJob Job) Create()
    {
        var cache = new RecurringJobActivityCache(new FakeTimeProvider());
        return (new RecurringJobActivityHandler(cache), cache, new FakeRecurringJob());
    }

    [Fact]
    public void Executing_MarksTheJobRunning()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobExecutingNotification(job, new EventMessages()));

        Assert.True(cache.Get(typeof(FakeRecurringJob))!.IsRunning);
    }

    [Fact]
    public void Executed_RecordsSuccess()
    {
        var (handler, cache, job) = Create();
        handler.Handle(new RecurringBackgroundJobExecutingNotification(job, new EventMessages()));

        handler.Handle(new RecurringBackgroundJobExecutedNotification(job, new EventMessages()));

        var activity = cache.Get(typeof(FakeRecurringJob))!;
        Assert.False(activity.IsRunning);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
    }

    [Fact]
    public void Failed_RecordsFailure()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobFailedNotification(job, new EventMessages()));

        Assert.Equal(BackgroundJobOutcome.Failed, cache.Get(typeof(FakeRecurringJob))!.LastOutcome);
    }

    [Fact]
    public void Cancelled_RecordsCancellation()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobCanceledNotification(job, new EventMessages()));

        Assert.Equal(BackgroundJobOutcome.Cancelled, cache.Get(typeof(FakeRecurringJob))!.LastOutcome);
    }

    [Fact]
    public void Ignored_RecordsSkip_WithoutALastRun()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobIgnoredNotification(job, new EventMessages()));

        var activity = cache.Get(typeof(FakeRecurringJob))!;
        Assert.Equal(BackgroundJobOutcome.Ignored, activity.LastOutcome);
        Assert.Null(activity.LastRun);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: compile error, `The type or namespace name 'RecurringJobActivityHandler' could not be found`.

If `RecurringBackgroundJobExecutingNotification`'s constructor is not public, or `IRecurringBackgroundJob`
requires more members than the fake supplies, fix the fake to match the 17.0.0 surface before
continuing. Do not change the assertions.

- [ ] **Step 3: Implement**

`src/Umbraco.Community.UmbraDesktop/BackgroundJobs/Notifications/RecurringJobActivityHandler.cs`:

```csharp
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;

/// <summary>
/// Translates Umbraco's recurring background job notifications into <see cref="RecurringJobActivityCache"/>
/// entries.
/// </summary>
/// <remarks>
/// These notifications are the only observable surface for recurring jobs;
/// <c>RecurringBackgroundJobHostedServiceRunner</c> exposes nothing about the jobs it is running.
/// </remarks>
/// <param name="cache">The cache to record into.</param>
public sealed class RecurringJobActivityHandler(RecurringJobActivityCache cache) :
    INotificationHandler<RecurringBackgroundJobExecutingNotification>,
    INotificationHandler<RecurringBackgroundJobExecutedNotification>,
    INotificationHandler<RecurringBackgroundJobFailedNotification>,
    INotificationHandler<RecurringBackgroundJobIgnoredNotification>,
    INotificationHandler<RecurringBackgroundJobCanceledNotification>
{
    /// <summary>Records that the job has begun executing.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobExecutingNotification notification)
        => cache.RecordExecuting(notification.Job.GetType());

    /// <summary>Records that the job completed successfully.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobExecutedNotification notification)
        => cache.RecordCompleted(notification.Job.GetType(), BackgroundJobOutcome.Succeeded);

    /// <summary>Records that the job threw.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobFailedNotification notification)
        => cache.RecordCompleted(notification.Job.GetType(), BackgroundJobOutcome.Failed);

    /// <summary>Records that the job's scheduled run was skipped.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobIgnoredNotification notification)
        => cache.RecordIgnored(notification.Job.GetType());

    /// <summary>Records that the job was cancelled, typically by application shutdown.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobCanceledNotification notification)
        => cache.RecordCompleted(notification.Job.GetType(), BackgroundJobOutcome.Cancelled);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: `Passed! - Failed: 0, Passed: 14`

- [ ] **Step 5: 🚦 Review checkpoint**

Stop. Report the handler and its tests. Do not commit.

---

### Task 5: `BackgroundJobReportService` — the distributed path

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/IBackgroundJobReportService.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/BackgroundJobReportService.cs`
- Test: `src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/BackgroundJobReportServiceDistributedTests.cs`

- [ ] **Step 1: Write the failing tests**

`src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/BackgroundJobReportServiceDistributedTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Models;
using Umbraco.Cms.Infrastructure.Persistence.Repositories;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

public class BackgroundJobReportServiceDistributedTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    private sealed class FakeDistributedJob(string name, TimeSpan period) : IDistributedBackgroundJob
    {
        public string Name => name;

        public TimeSpan Period => period;

        public Task ExecuteAsync() => Task.CompletedTask;
    }

    private static BackgroundJobReportService Create(
        IEnumerable<IDistributedBackgroundJob> registered,
        IEnumerable<DistributedBackgroundJobModel> rows,
        IDictionary<string, string?>? configuration = null)
    {
        var repository = Substitute.For<IDistributedJobRepository>();
        repository.GetAll().Returns(rows);

        var scopeProvider = Substitute.For<ICoreScopeProvider>();
        scopeProvider.CreateCoreScope().Returns(Substitute.For<ICoreScope>());

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(configuration ?? new Dictionary<string, string?>())
            .Build();

        return new BackgroundJobReportService(
            registered,
            repository,
            scopeProvider,
            [],
            new RecurringJobActivityCache(new FakeTimeProvider(Now)),
            config,
            new FakeTimeProvider(Now));
    }

    private static DistributedBackgroundJobModel Row(
        string name,
        TimeSpan period,
        DateTime lastRun,
        DateTime lastAttemptedRun,
        bool isRunning) =>
        new()
        {
            Id = 1,
            Name = name,
            Period = period,
            LastRun = lastRun,
            LastAttemptedRun = lastAttemptedRun,
            IsRunning = isRunning,
        };

    [Fact]
    public void NextRun_IsLastRunPlusPeriod()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-3);
        var service = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobKind.Distributed, job.Kind);
        Assert.Equal(BackgroundJobState.Idle, job.State);
        Assert.Equal(new DateTimeOffset(lastRun, TimeSpan.Zero) + period, job.NextRun);
    }

    [Fact]
    public void State_IsRunning_WhenInsideTheReclaimWindow()
    {
        var period = TimeSpan.FromMinutes(10);
        // 10m period + 5m default timeout = 15m before reclaim. 14m in is still healthy.
        var attempted = Now.UtcDateTime.AddMinutes(-14);
        var service = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Running, job.State);
    }

    [Fact]
    public void State_IsStale_OnlyOncePastPeriodPlusMaximumExecutionTime()
    {
        var period = TimeSpan.FromMinutes(10);
        // 16m in, past the 15m reclaim threshold. Asserting the period is part of the threshold:
        // using MaximumExecutionTime alone would have flagged this at 5m.
        var attempted = Now.UtcDateTime.AddMinutes(-16);
        var service = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Stale, job.State);
    }

    [Fact]
    public void MaximumExecutionTime_IsReadFromConfiguration_WhenPresent()
    {
        var period = TimeSpan.FromMinutes(10);
        var attempted = Now.UtcDateTime.AddMinutes(-16);
        var service = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)],
            new Dictionary<string, string?>
            {
                ["Umbraco:CMS:DistributedJobs:MaximumExecutionTime"] = "01:00:00",
            });

        var job = Assert.Single(service.GetReport().Jobs);

        // 10m + 60m = 70m threshold, so 16m in is still running rather than stale.
        Assert.Equal(BackgroundJobState.Running, job.State);
    }

    [Fact]
    public void LastOutcome_IsAlwaysUnavailable()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var service = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobOutcome.Unavailable, job.LastOutcome);
    }

    [Fact]
    public void OrphanedRows_AreNotListed()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var service = Create(
            [new FakeDistributedJob("StillHere", period)],
            [
                Row("StillHere", period, lastRun, lastRun, isRunning: false),
                Row("UninstalledPackageJob", period, lastRun, lastRun, isRunning: true),
            ]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal("StillHere", job.Name);
    }

    [Fact]
    public void ServerRoles_AreEmptyForDistributedJobs()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var service = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Empty(job.ServerRoles);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: compile error, `The type or namespace name 'BackgroundJobReportService' could not be found`.

- [ ] **Step 3: Write the interface**

`src/Umbraco.Community.UmbraDesktop/BackgroundJobs/IBackgroundJobReportService.cs`:

```csharp
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Builds a snapshot of every background job Umbraco has registered.
/// </summary>
public interface IBackgroundJobReportService
{
    /// <summary>
    /// Builds the report from the distributed job table and the observed recurring job activity.
    /// </summary>
    /// <returns>Every registered job, ordered by kind then name.</returns>
    BackgroundJobReport GetReport();
}
```

- [ ] **Step 4: Implement the distributed path**

`src/Umbraco.Community.UmbraDesktop/BackgroundJobs/BackgroundJobReportService.cs`. The recurring
half is added in Task 6; `GetRecurring` returns an empty list for now so the distributed tests can
pass on their own.

```csharp
using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Persistence.Repositories;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Merges Umbraco's two background job mechanisms into a single report.
/// </summary>
/// <param name="distributedJobs">Registered distributed jobs, the definition half.</param>
/// <param name="distributedJobRepository">The distributed job table, the state half.</param>
/// <param name="scopeProvider">Provides the scope the repository read needs.</param>
/// <param name="recurringJobs">Registered recurring jobs, the definition half.</param>
/// <param name="activityCache">Observed recurring job activity, the state half.</param>
/// <param name="configuration">Read for the distributed job execution timeout.</param>
/// <param name="timeProvider">Clock used for staleness and next-run arithmetic.</param>
public sealed class BackgroundJobReportService(
    IEnumerable<IDistributedBackgroundJob> distributedJobs,
    IDistributedJobRepository distributedJobRepository,
    ICoreScopeProvider scopeProvider,
    IEnumerable<IRecurringBackgroundJob> recurringJobs,
    RecurringJobActivityCache activityCache,
    IConfiguration configuration,
    TimeProvider timeProvider) : IBackgroundJobReportService
{
    /// <summary>
    /// Configuration key for Umbraco's distributed job execution timeout.
    /// </summary>
    /// <remarks>
    /// Read from configuration rather than <c>DistributedJobSettings</c> because the
    /// <c>MaximumExecutionTime</c> property was added in 17.1.0 and this package compiles against
    /// 17.0.0. Note the section is <c>DistributedJobs</c>, plural.
    /// </remarks>
    private const string MaximumExecutionTimeKey = "Umbraco:CMS:DistributedJobs:MaximumExecutionTime";

    /// <summary>Umbraco's own default for the distributed job execution timeout.</summary>
    private static readonly TimeSpan DefaultMaximumExecutionTime = TimeSpan.FromMinutes(5);

    /// <inheritdoc />
    public BackgroundJobReport GetReport()
    {
        var jobs = new List<BackgroundJobStatus>();
        jobs.AddRange(GetDistributed());
        jobs.AddRange(GetRecurring());

        return new BackgroundJobReport(
            activityCache.MonitoringSince,
            jobs.OrderBy(job => job.Kind)
                .ThenBy(job => job.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    /// <summary>
    /// Builds a row for every distributed job that is both registered and present in the table.
    /// </summary>
    /// <returns>The distributed jobs.</returns>
    private List<BackgroundJobStatus> GetDistributed()
    {
        var registered = distributedJobs.ToDictionary(job => job.Name, StringComparer.OrdinalIgnoreCase);
        var maximumExecutionTime = configuration.GetValue<TimeSpan?>(MaximumExecutionTimeKey)
                                   ?? DefaultMaximumExecutionTime;
        var now = timeProvider.GetUtcNow();

        using var scope = scopeProvider.CreateCoreScope();
        var rows = distributedJobRepository.GetAll().ToArray();
        scope.Complete();

        var result = new List<BackgroundJobStatus>();

        foreach (var row in rows)
        {
            // A row whose job is no longer registered is left permanently running: TryTakeRunnableAsync
            // sets IsRunning before it discovers the job is missing, then returns null, so FinishAsync
            // never runs. Listing it would show a phantom job stuck in a failure state. EnsureJobsAsync
            // deletes these on the next application start.
            if (registered.TryGetValue(row.Name, out var definition) is false)
            {
                continue;
            }

            var lastRun = AsUtc(row.LastRun);
            var lastAttemptedRun = AsUtc(row.LastAttemptedRun);

            result.Add(new BackgroundJobStatus(
                row.Name,
                definition.GetType().FullName ?? row.Name,
                BackgroundJobKind.Distributed,
                DistributedState(row.IsRunning, now, lastAttemptedRun, row.Period, maximumExecutionTime),
                BackgroundJobOutcome.Unavailable,
                row.Period,
                lastRun,
                lastRun + row.Period,
                []));
        }

        return result;
    }

    /// <summary>
    /// Placeholder for the recurring half, implemented in Task 6.
    /// </summary>
    /// <returns>An empty list.</returns>
    private List<BackgroundJobStatus> GetRecurring() => [];

    /// <summary>
    /// Decides a distributed job's state, matching core's own reclaim condition.
    /// </summary>
    /// <param name="isRunning">Whether the row is marked as running.</param>
    /// <param name="now">The current time.</param>
    /// <param name="lastAttemptedRun">When the run was claimed.</param>
    /// <param name="period">The job's scheduled period.</param>
    /// <param name="maximumExecutionTime">The configured execution timeout.</param>
    /// <returns>The state to report.</returns>
    /// <remarks>
    /// The threshold is <c>Period + MaximumExecutionTime</c>, not <c>MaximumExecutionTime</c> alone.
    /// That is what <c>DistributedJobService.TryTakeRunnableAsync</c> uses to decide a job may be
    /// reclaimed, and reporting stale any earlier would contradict Umbraco's own view.
    /// </remarks>
    private static BackgroundJobState DistributedState(
        bool isRunning,
        DateTimeOffset now,
        DateTimeOffset lastAttemptedRun,
        TimeSpan period,
        TimeSpan maximumExecutionTime)
    {
        if (isRunning is false)
        {
            return BackgroundJobState.Idle;
        }

        return now - lastAttemptedRun > period + maximumExecutionTime
            ? BackgroundJobState.Stale
            : BackgroundJobState.Running;
    }

    /// <summary>
    /// Reinterprets a database timestamp as UTC.
    /// </summary>
    /// <param name="value">The value read from the table.</param>
    /// <returns>The same instant, tagged as UTC.</returns>
    /// <remarks>
    /// Umbraco writes <c>DateTime.UtcNow</c> into these columns, but the provider returns
    /// <see cref="DateTimeKind.Unspecified"/>, which would otherwise be read as local time.
    /// </remarks>
    private static DateTimeOffset AsUtc(DateTime value)
        => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: `Passed! - Failed: 0, Passed: 21`

- [ ] **Step 6: 🚦 Review checkpoint**

Stop. Report the interface, the service so far, and the seven distributed tests. Do not commit.

---

### Task 6: `BackgroundJobReportService` — the recurring path

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/BackgroundJobs/BackgroundJobReportService.cs`
- Test: `src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/BackgroundJobReportServiceRecurringTests.cs`

- [ ] **Step 1: Write the failing tests**

`src/Umbraco.Community.UmbraDesktop.Tests/BackgroundJobs/BackgroundJobReportServiceRecurringTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Sync;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Models;
using Umbraco.Cms.Infrastructure.Persistence.Repositories;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

public class BackgroundJobReportServiceRecurringTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    private sealed class FakeRecurringJob(TimeSpan period, TimeSpan delay, params ServerRole[] roles)
        : IRecurringBackgroundJob
    {
        public TimeSpan Period => period;

        public TimeSpan Delay => delay;

        public TimeSpan IgnoredDelay => TimeSpan.FromMinutes(1);

        public ServerRole[] ServerRoles => roles.Length is 0 ? [ServerRole.Single] : roles;

        public event EventHandler? PeriodChanged { add { } remove { } }

        public event EventHandler? IgnoredDelayChanged { add { } remove { } }

        public Task RunJobAsync() => Task.CompletedTask;
    }

    private static (BackgroundJobReportService Service, RecurringJobActivityCache Cache, FakeTimeProvider Time) Create(
        params IRecurringBackgroundJob[] jobs)
    {
        var time = new FakeTimeProvider(Start);
        var cache = new RecurringJobActivityCache(time);

        var repository = Substitute.For<IDistributedJobRepository>();
        repository.GetAll().Returns(Array.Empty<DistributedBackgroundJobModel>());

        var scopeProvider = Substitute.For<ICoreScopeProvider>();
        scopeProvider.CreateCoreScope().Returns(Substitute.For<ICoreScope>());

        var service = new BackgroundJobReportService(
            [],
            repository,
            scopeProvider,
            jobs,
            cache,
            new ConfigurationBuilder().Build(),
            time);

        return (service, cache, time);
    }

    [Fact]
    public void UnobservedJob_TakesNextRunFromMonitoringSincePlusDelay()
    {
        var delay = TimeSpan.FromMinutes(2);
        var (service, _, _) = Create(new FakeRecurringJob(TimeSpan.FromMinutes(5), delay));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobKind.Recurring, job.Kind);
        Assert.Null(job.LastRun);
        Assert.Equal(BackgroundJobOutcome.NotObserved, job.LastOutcome);
        Assert.Equal(Start + delay, job.NextRun);
    }

    [Fact]
    public void ObservedJob_TakesNextRunFromLastRunPlusPeriod()
    {
        var period = TimeSpan.FromMinutes(5);
        var (service, cache, time) = Create(new FakeRecurringJob(period, TimeSpan.FromMinutes(2)));
        time.Advance(TimeSpan.FromMinutes(3));
        cache.RecordCompleted(typeof(FakeRecurringJob), BackgroundJobOutcome.Succeeded);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(Start.AddMinutes(3), job.LastRun);
        Assert.Equal(Start.AddMinutes(3) + period, job.NextRun);
    }

    [Fact]
    public void InfinitePeriod_IsManual_WithNoNextRun()
    {
        var (service, _, _) = Create(
            new FakeRecurringJob(Timeout.InfiniteTimeSpan, TimeSpan.FromMinutes(2)));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Manual, job.State);
        Assert.Null(job.Period);
        Assert.Null(job.NextRun);
    }

    [Fact]
    public void InfiniteDelay_HasNoNextRun_UntilObserved()
    {
        var (service, cache, time) = Create(
            new FakeRecurringJob(TimeSpan.FromMinutes(5), Timeout.InfiniteTimeSpan));

        Assert.Null(Assert.Single(service.GetReport().Jobs).NextRun);

        time.Advance(TimeSpan.FromMinutes(1));
        cache.RecordCompleted(typeof(FakeRecurringJob), BackgroundJobOutcome.Succeeded);

        Assert.Equal(Start.AddMinutes(6), Assert.Single(service.GetReport().Jobs).NextRun);
    }

    [Fact]
    public void RunningTakesPrecedenceOverManual()
    {
        var (service, cache, _) = Create(
            new FakeRecurringJob(Timeout.InfiniteTimeSpan, TimeSpan.FromMinutes(2)));
        cache.RecordExecuting(typeof(FakeRecurringJob));

        Assert.Equal(BackgroundJobState.Running, Assert.Single(service.GetReport().Jobs).State);
    }

    [Fact]
    public void ServerRoles_AreCarriedThrough()
    {
        var (service, _, _) = Create(new FakeRecurringJob(
            TimeSpan.FromMinutes(5),
            TimeSpan.FromMinutes(2),
            ServerRole.SchedulingPublisher,
            ServerRole.Subscriber));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(["SchedulingPublisher", "Subscriber"], job.ServerRoles);
    }

    [Fact]
    public void Outcome_IsCarriedThroughFromTheCache()
    {
        var (service, cache, _) = Create(new FakeRecurringJob(TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(2)));
        cache.RecordIgnored(typeof(FakeRecurringJob));

        Assert.Equal(BackgroundJobOutcome.Ignored, Assert.Single(service.GetReport().Jobs).LastOutcome);
    }
}
```

If `ServerRole.SchedulingPublisher` and `ServerRole.Subscriber` are not the member names in 17.0.0,
substitute the real ones. Do not weaken the assertion to avoid checking the names.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: 7 failures, each reporting `Assert.Single` found 0 items, because `GetRecurring` still
returns an empty list.

- [ ] **Step 3: Replace `GetRecurring`**

In `BackgroundJobReportService.cs`, replace the placeholder `GetRecurring` with:

```csharp
    /// <summary>
    /// Builds a row for every registered recurring job, joined to what has been observed of it.
    /// </summary>
    /// <returns>The recurring jobs.</returns>
    private List<BackgroundJobStatus> GetRecurring()
    {
        var result = new List<BackgroundJobStatus>();

        foreach (var job in recurringJobs)
        {
            var jobType = job.GetType();
            var activity = activityCache.Get(jobType);
            var isManual = job.Period == Timeout.InfiniteTimeSpan;

            result.Add(new BackgroundJobStatus(
                jobType.Name,
                jobType.FullName ?? jobType.Name,
                BackgroundJobKind.Recurring,
                RecurringState(activity, isManual),
                activity?.LastOutcome ?? BackgroundJobOutcome.NotObserved,
                isManual ? null : job.Period,
                activity?.LastRun,
                RecurringNextRun(job, activity, isManual),
                job.ServerRoles.Select(role => role.ToString()).ToArray()));
        }

        return result;
    }

    /// <summary>
    /// Decides a recurring job's state.
    /// </summary>
    /// <param name="activity">What has been observed, if anything.</param>
    /// <param name="isManual">Whether automatic scheduling is disabled.</param>
    /// <returns>The state to report.</returns>
    /// <remarks>
    /// Running wins over manual: a job with scheduling disabled can still have been triggered, and
    /// reporting it as merely manual while it executes would be wrong.
    /// </remarks>
    private static BackgroundJobState RecurringState(RecurringJobActivity? activity, bool isManual)
    {
        if (activity?.IsRunning is true)
        {
            return BackgroundJobState.Running;
        }

        return isManual ? BackgroundJobState.Manual : BackgroundJobState.Idle;
    }

    /// <summary>
    /// Works out when a recurring job is next expected to run.
    /// </summary>
    /// <param name="job">The registered job.</param>
    /// <param name="activity">What has been observed, if anything.</param>
    /// <param name="isManual">Whether automatic scheduling is disabled.</param>
    /// <returns>The expected time, or <see langword="null"/> if it cannot be determined.</returns>
    /// <remarks>
    /// Approximate. A job's first run can be shifted by cron configuration through
    /// <c>DelayCalculator</c>, and <see cref="IRecurringBackgroundJob"/> does not expose that.
    /// </remarks>
    private DateTimeOffset? RecurringNextRun(
        IRecurringBackgroundJob job,
        RecurringJobActivity? activity,
        bool isManual)
    {
        if (isManual)
        {
            return null;
        }

        if (activity?.LastRun is { } lastRun)
        {
            return lastRun + job.Period;
        }

        return job.Delay == Timeout.InfiniteTimeSpan
            ? null
            : activityCache.MonitoringSince + job.Delay;
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test src/Umbraco.Community.UmbraDesktop.Tests -v q`
Expected: `Passed! - Failed: 0, Passed: 28`

- [ ] **Step 5: 🚦 Review checkpoint**

Stop. Report the completed service and the full test count. This is the end of the domain layer and
the largest review of the plan. Do not commit.

---

# Milestone 3 — API

### Task 7: Reference `Umbraco.Cms.Api.Management`

**Files:**
- Modify: `src/Directory.Packages.props`
- Modify: `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj`

- [ ] **Step 1: Add the version**

In `src/Directory.Packages.props`, beside the existing Umbraco entries:

```xml
    <PackageVersion Include="Umbraco.Cms.Api.Management" Version="[17.0.0,18.0.0)" />
```

- [ ] **Step 2: Add the reference**

In `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj`, in the `ItemGroup`
that already has `Umbraco.Cms.Api.Common`:

```xml
	  <PackageReference Include="Umbraco.Cms.Api.Management" />
```

- [ ] **Step 3: Build**

Run: `dotnet build src/Umbraco.Community.UmbraDesktop -v q`
Expected: `Build succeeded`. `packages.lock.json` for the package project is updated.

- [ ] **Step 4: 🚦 Review checkpoint**

Stop. Report the new dependency and the lock file change, noting this widens the package's declared
dependency surface. Do not commit.

---

### Task 8: The response models and controller

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/Api/ViewModels/BackgroundJobResponseModel.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/Api/ViewModels/BackgroundJobReportResponseModel.cs`
- Create: `src/Umbraco.Community.UmbraDesktop/Api/BackgroundJobsController.cs`

- [ ] **Step 1: `BackgroundJobResponseModel.cs`**

Periods cross the wire as seconds rather than `TimeSpan`, which serialises as `"00:05:00"` and
would need parsing in TypeScript. Enums cross as strings so the generated client gets readable
union types.

```csharp
namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// One background job, as returned by the management API.
/// </summary>
/// <param name="Name">Display name.</param>
/// <param name="TypeName">Full CLR type name, the stable identity across refreshes.</param>
/// <param name="Kind">Either <c>Distributed</c> or <c>Recurring</c>.</param>
/// <param name="State">One of <c>Idle</c>, <c>Running</c>, <c>Stale</c> or <c>Manual</c>.</param>
/// <param name="LastOutcome">How the last observed run ended.</param>
/// <param name="PeriodSeconds">
/// How often the job is scheduled, in seconds, or <see langword="null"/> when scheduling is off.
/// </param>
/// <param name="LastRun">When the job last ran, or <see langword="null"/> if not observed.</param>
/// <param name="NextRun">When it is next expected, or <see langword="null"/> if unknown.</param>
/// <param name="ServerRoles">Roles the job may run on. Empty for distributed jobs.</param>
public record BackgroundJobResponseModel(
    string Name,
    string TypeName,
    string Kind,
    string State,
    string LastOutcome,
    double? PeriodSeconds,
    DateTimeOffset? LastRun,
    DateTimeOffset? NextRun,
    IReadOnlyList<string> ServerRoles);
```

- [ ] **Step 2: `BackgroundJobReportResponseModel.cs`**

```csharp
namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// The full background job report, as returned by the management API.
/// </summary>
/// <param name="MonitoringSince">
/// When this server began observing recurring jobs. The UI needs it to explain why a recurring
/// job's last run may be empty.
/// </param>
/// <param name="Jobs">The jobs, ordered by kind then name.</param>
public record BackgroundJobReportResponseModel(
    DateTimeOffset MonitoringSince,
    IReadOnlyList<BackgroundJobResponseModel> Jobs);
```

- [ ] **Step 3: `BackgroundJobsController.cs`**

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Exposes the background job report to the backoffice.
/// </summary>
/// <remarks>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </remarks>
/// <param name="reportService">Builds the report.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/background-jobs")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public class BackgroundJobsController(IBackgroundJobReportService reportService)
    : ManagementApiControllerBase
{
    /// <summary>
    /// Gets every background job Umbraco has registered on this server.
    /// </summary>
    /// <returns>The report.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BackgroundJobReportResponseModel), StatusCodes.Status200OK)]
    public IActionResult GetBackgroundJobs()
    {
        var report = reportService.GetReport();

        return Ok(new BackgroundJobReportResponseModel(
            report.MonitoringSince,
            report.Jobs.Select(job => new BackgroundJobResponseModel(
                job.Name,
                job.TypeName,
                job.Kind.ToString(),
                job.State.ToString(),
                job.LastOutcome.ToString(),
                job.Period?.TotalSeconds,
                job.LastRun,
                job.NextRun,
                job.ServerRoles)).ToArray()));
    }
}
```

- [ ] **Step 4: Build**

Run: `dotnet build src/Umbraco.Community.UmbraDesktop -v q`
Expected: `Build succeeded` with 0 warnings.

- [ ] **Step 5: 🚦 Review checkpoint**

Stop. Report the two view models and the controller. Do not commit.

---

### Task 9: Register everything

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/Composing/BackgroundJobsComposer.cs`

- [ ] **Step 1: Write the composer**

```csharp
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.Api.Handlers;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Registers the background job reporting services, the notification handlers that feed them, and
/// the OpenAPI naming handlers this package's management API needs.
/// </summary>
public class BackgroundJobsComposer : IComposer
{
    /// <summary>
    /// Wires everything into the container.
    /// </summary>
    /// <param name="builder">The Umbraco builder.</param>
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton: it is the only record of recurring job activity for this application instance,
        // so a scoped or transient lifetime would discard it on every request.
        builder.Services.AddSingleton<RecurringJobActivityCache>();
        builder.Services.AddSingleton<IBackgroundJobReportService, BackgroundJobReportService>();

        builder.AddNotificationHandler<RecurringBackgroundJobExecutingNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobExecutedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobFailedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobIgnoredNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobCanceledNotification, RecurringJobActivityHandler>();

        // Scaffolded in Api/Handlers but never registered, because this is the package's first
        // management API endpoint. Without them the generated client method names carry the full
        // controller and namespace.
        builder.Services.AddSingleton<IOperationIdHandler, PackageOperationIdHandler>();
        builder.Services.AddSingleton<ISchemaIdHandler, PackageSchemaIdHandler>();
    }
}
```

The handler class names are `PackageOperationIdHandler` and `PackageSchemaIdHandler`, both verified
present in `Api/Handlers/`.

`BackgroundJobReportService` is registered as a singleton so it shares the cache instance directly.
It takes `IEnumerable<IDistributedBackgroundJob>`, `IEnumerable<IRecurringBackgroundJob>`,
`IDistributedJobRepository`, `ICoreScopeProvider`, `IConfiguration` and `TimeProvider`, all of which
Umbraco registers as singletons already.

- [ ] **Step 2: Build**

Run: `dotnet build src/Umbraco.Community.UmbraDesktop -v q`
Expected: `Build succeeded`.

- [ ] **Step 3: Verify the endpoint by hand**

Run: `dotnet run --project src/Umbraco.Community.UmbraDesktop.TestInstance`

Then, signed in to the backoffice, open:
`https://localhost:44354/umbraco/swagger/index.html?urls.primaryName=Umbraco+Management+API`

Expected: `GET /umbraco/management/api/v1/umbradesktop/background-jobs` is listed. Executing it
returns `200` with a `monitoringSince` and a `jobs` array containing the ten distributed jobs from
`umbracoDistributedJob` plus the recurring jobs registered on this instance.

Confirm while you are here: every distributed job reads `"lastOutcome": "Unavailable"`, and the
recurring jobs read `"NotObserved"` until one fires.

- [ ] **Step 4: Generate the TypeScript client**

With the site still running:

Run: `npm run generate-client --prefix src/Umbraco.Community.UmbraDesktop`
Expected: the script prints `Generating OpenAPI client...` and writes into
`src/Umbraco.Community.UmbraDesktop/backoffice/src/api`, which does not exist yet and is created
by this step.

- [ ] **Step 5: 🚦 Review checkpoint**

Stop. Report the composer, the endpoint output you saw, and the generated client files. This is the
first time `backoffice/src/api` has existed, so it is worth a look at whether it should be committed
or generated on demand. Do not commit.

---

# Milestone 4 — UI

### Task 10: Localisation strings

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/en.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/nl.ts`

- [ ] **Step 1: Add the English strings**

In `en.ts`, inside the `umbraDesktop` object, after the existing app names:

```ts
    appBackgroundJobs: 'Background Jobs',
    // Background Jobs app
    backgroundJobsName: 'Name',
    backgroundJobsKind: 'Kind',
    backgroundJobsState: 'Status',
    backgroundJobsPeriod: 'Every',
    backgroundJobsLastRun: 'Last run',
    backgroundJobsLastOutcome: 'Outcome',
    backgroundJobsNextRun: 'Next run',
    backgroundJobsServerRoles: 'Server roles',
    backgroundJobsKindDistributed: 'Distributed',
    backgroundJobsKindRecurring: 'Recurring',
    backgroundJobsStateIdle: 'Idle',
    backgroundJobsStateRunning: 'Running',
    backgroundJobsStateStale: 'Stale',
    backgroundJobsStateManual: 'Manual',
    backgroundJobsOutcomeUnavailable: 'Not recorded by Umbraco',
    backgroundJobsOutcomeNotObserved: 'Not since restart',
    backgroundJobsOutcomeSucceeded: 'Succeeded',
    backgroundJobsOutcomeFailed: 'Failed',
    backgroundJobsOutcomeIgnored: 'Skipped on this server',
    backgroundJobsOutcomeCancelled: 'Cancelled',
    backgroundJobsNeverRun: 'Not since restart',
    backgroundJobsMonitoringSince: 'Monitoring since %0%',
    backgroundJobsRefresh: 'Refresh',
```

- [ ] **Step 2: Add the Dutch strings**

In `nl.ts`, matching keys:

```ts
    appBackgroundJobs: 'Achtergrondtaken',
    // Background Jobs app
    backgroundJobsName: 'Naam',
    backgroundJobsKind: 'Soort',
    backgroundJobsState: 'Status',
    backgroundJobsPeriod: 'Elke',
    backgroundJobsLastRun: 'Laatste uitvoering',
    backgroundJobsLastOutcome: 'Resultaat',
    backgroundJobsNextRun: 'Volgende uitvoering',
    backgroundJobsServerRoles: 'Serverrollen',
    backgroundJobsKindDistributed: 'Gedistribueerd',
    backgroundJobsKindRecurring: 'Terugkerend',
    backgroundJobsStateIdle: 'Inactief',
    backgroundJobsStateRunning: 'Actief',
    backgroundJobsStateStale: 'Vastgelopen',
    backgroundJobsStateManual: 'Handmatig',
    backgroundJobsOutcomeUnavailable: 'Niet vastgelegd door Umbraco',
    backgroundJobsOutcomeNotObserved: 'Niet sinds herstart',
    backgroundJobsOutcomeSucceeded: 'Geslaagd',
    backgroundJobsOutcomeFailed: 'Mislukt',
    backgroundJobsOutcomeIgnored: 'Overgeslagen op deze server',
    backgroundJobsOutcomeCancelled: 'Geannuleerd',
    backgroundJobsNeverRun: 'Niet sinds herstart',
    backgroundJobsMonitoringSince: 'Gevolgd sinds %0%',
    backgroundJobsRefresh: 'Vernieuwen',
```

- [ ] **Step 3: 🚦 Review checkpoint**

Stop. Report both files, and flag the Dutch wording for Luuk to correct as a native speaker. Do not
commit.

---

### Task 11: The dashboard element

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/dashboards/background-jobs/background-jobs.element.ts`

- [ ] **Step 1: Write the element**

```ts
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import { BackgroundJobsService } from '../../api';

/** How often the table refreshes itself while the window is visible. */
const REFRESH_INTERVAL_MS = 5000;

/**
 * Read-only view of every background job Umbraco has registered on this server: distributed jobs,
 * whose state is stored in the database, and recurring jobs, whose state is only what this
 * application instance has observed since it started.
 *
 * Auto-refresh pauses while the document is hidden, so a backgrounded desktop window does not keep
 * polling. See the Background Jobs design doc (2026-09-06).
 */
@customElement('umbradesktop-background-jobs')
export class UmbraDesktopBackgroundJobsElement extends UmbLitElement {
  @state() private _jobs: Array<Record<string, unknown>> = [];
  @state() private _monitoringSince?: string;
  @state() private _loading = true;

  #timer?: ReturnType<typeof setInterval>;

  override connectedCallback() {
    super.connectedCallback();
    this.#load();
    this.#timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.#load();
    }, REFRESH_INTERVAL_MS);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#timer) clearInterval(this.#timer);
  }

  /** Fetch the report. Failures leave the previous rows in place rather than blanking the table. */
  async #load() {
    const { data } = await tryExecute(this, BackgroundJobsService.getBackgroundJobs());
    if (data) {
      this._jobs = data.jobs ?? [];
      this._monitoringSince = data.monitoringSince;
    }
    this._loading = false;
  }

  /** Render a period in seconds as a compact human duration. */
  #period(seconds: number | null | undefined) {
    if (seconds === null || seconds === undefined) return '–';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }

  /** Render a timestamp, or the "not since restart" fallback when there is none. */
  #time(value: string | null | undefined) {
    if (!value) return this.localize.term('umbraDesktop_backgroundJobsNeverRun');
    return new Date(value).toLocaleString();
  }

  /** Look up a localized label for an enum value coming from the API. */
  #label(prefix: string, value: unknown) {
    return this.localize.term(`umbraDesktop_backgroundJobs${prefix}${String(value)}`);
  }

  override render() {
    if (this._loading) return html`<uui-loader></uui-loader>`;

    return html`
      <uui-box>
        <div slot="header-actions">
          <uui-button
            look="secondary"
            label=${this.localize.term('umbraDesktop_backgroundJobsRefresh')}
            @click=${() => this.#load()}></uui-button>
        </div>
        <uui-table>
          <uui-table-head>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsName')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsKind')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsState')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsPeriod')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsLastRun')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsLastOutcome')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsNextRun')}</uui-table-head-cell>
            <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsServerRoles')}</uui-table-head-cell>
          </uui-table-head>
          ${this._jobs.map(
            (job) => html`
              <uui-table-row>
                <uui-table-cell><strong>${job.name}</strong></uui-table-cell>
                <uui-table-cell>${this.#label('Kind', job.kind)}</uui-table-cell>
                <uui-table-cell>${this.#label('State', job.state)}</uui-table-cell>
                <uui-table-cell>${this.#period(job.periodSeconds as number)}</uui-table-cell>
                <uui-table-cell>${this.#time(job.lastRun as string)}</uui-table-cell>
                <uui-table-cell>${this.#label('Outcome', job.lastOutcome)}</uui-table-cell>
                <uui-table-cell>${this.#time(job.nextRun as string)}</uui-table-cell>
                <uui-table-cell>${(job.serverRoles as string[])?.join(', ') || '–'}</uui-table-cell>
              </uui-table-row>
            `,
          )}
        </uui-table>
        ${this._monitoringSince
          ? html`<p class="footnote">
              ${this.localize.term(
                'umbraDesktop_backgroundJobsMonitoringSince',
                new Date(this._monitoringSince).toLocaleString(),
              )}
            </p>`
          : nothing}
      </uui-box>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-layout-1);
      }
      .footnote {
        margin-top: var(--uui-size-space-4);
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopBackgroundJobsElement;
```

The service and method names in `../../api` come from the generated client in Task 9. Open that
folder and use the names it actually produced rather than assuming `BackgroundJobsService.getBackgroundJobs`.

- [ ] **Step 2: Build the frontend**

Run: `npm run build --prefix src/Umbraco.Community.UmbraDesktop`
Expected: `tsc` reports no errors and `vite build` writes to `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop`.

- [ ] **Step 3: 🚦 Review checkpoint**

Stop. Report the element and the build output. Do not commit.

---

### Task 12: Register the dashboard

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/dashboards/manifest.ts`

- [ ] **Step 1: Replace the placeholder manifest**

The file currently exports an empty array with a `//Add any dashboards here` comment.

```ts
import { UMB_SETTINGS_SECTION_ALIAS } from '@umbraco-cms/backoffice/settings';

/**
 * Dashboard manifests. Background Jobs is registered as an ordinary Settings dashboard rather than
 * something desktop-only: the data is pure Umbraco core, so anyone gets the tool, and the desktop
 * catalogue simply refs this dashboard and windows it with bare chrome.
 */
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
        match: UMB_SETTINGS_SECTION_ALIAS,
      },
    ],
  },
];
```

If `UMB_SETTINGS_SECTION_ALIAS` is not exported from that path in v17, use the literal
`'Umb.Section.Settings'`, which is what `diagnostics.ts` already uses for its `section` values.

- [ ] **Step 2: Build and verify in the backoffice**

Run: `npm run build --prefix src/Umbraco.Community.UmbraDesktop`
Then: `dotnet run --project src/Umbraco.Community.UmbraDesktop.TestInstance`

Expected: Settings section shows a **Background Jobs** dashboard tab listing the jobs, with a
working refresh button and the monitoring-since footnote.

- [ ] **Step 3: 🚦 Review checkpoint**

Stop. Report the manifest and what the dashboard looked like. Do not commit.

---

### Task 13: The catalogue entry

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/catalogue/diagnostics.ts`

- [ ] **Step 1: Add the entry**

Append to the `entries` array, after `profiling`:

```ts
  {
    // Our own dashboard, so the ref always resolves; no `optional` flag needed.
    alias: 'background-jobs',
    ref: 'Umbraco.Community.UmbraDesktop.Dashboard.BackgroundJobs',
    name: '#umbraDesktop_appBackgroundJobs',
    icon: 'icon-time',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 50,
  },
```

- [ ] **Step 2: Build and verify in the desktop**

Run: `npm run build --prefix src/Umbraco.Community.UmbraDesktop`
Then: `dotnet run --project src/Umbraco.Community.UmbraDesktop.TestInstance`

Expected: the desktop launcher shows **Background Jobs** in the Diagnostics group, and opening it
gives a window with the table and no section chrome or dashboard tab strip.

- [ ] **Step 3: Run the frontend tests**

Run: `npm run test --prefix src/Umbraco.Community.UmbraDesktop`
Expected: the existing catalogue tests still pass. `advanced-security.test.ts` exercises catalogue
shape, so a malformed entry surfaces here.

- [ ] **Step 4: 🚦 Review checkpoint**

Stop. Report the catalogue entry and both verifications. Do not commit.

---

### Task 14: Documentation

**Files:**
- Modify: `docs/design/2026-09-06-background-jobs-app-design.md`
- Modify: `README.md`

- [ ] **Step 1: Correct the route in the design**

In §8, change `umbra-desktop/background-jobs` to `umbradesktop/background-jobs`, and add beneath the
code block:

```markdown
The segment is `umbradesktop` without a hyphen because `backoffice/scripts/generate-openapi.js`
filters the spec on the path prefix `/umbraco/management/api/v1/umbradesktop`. `ManagementApiControllerBase`
already carries `[MapToApi(ManagementApiConfiguration.ApiName)]`, so the endpoint joins the existing
management Swagger document and no custom document is needed.
```

Also change **Status** in the header block from `Design, awaiting approval` to `Implemented`.

- [ ] **Step 2: Add the app to the README**

The README has no per-app list, so this goes in two places.

Add a bullet to `## Features`, after the theme bullet on line 26:

```markdown
- See what Umbraco is doing when you aren't. Background Jobs lists every scheduled job the CMS runs behind your site — publishing, webhooks, cleanups, and any a package added — with how often each runs, when it last ran, how that went and when it is due next. Umbraco shows this nowhere else.
```

Then add Background Jobs to the `bare` row of the chrome-profile table on line 149, which currently
reads `Single-focus dashboards: Examine, Health Check, Profiling`.

Note for the reviewer: this bullet is the first README claim about an app UmbraDesktop *provides*
rather than one it windows. `### The app catalogue` on line 153 still reads correctly, since the
entry points at a registered extension by alias like every other, but it is worth deciding whether
the README should say anywhere that the package now ships an app of its own.

- [ ] **Step 3: Check the definition of done**

Read the definition-of-done checklist in the repo `CLAUDE.md` and work through it. Code passing is
half; README, marketplace metadata and docs are the other half.

- [ ] **Step 4: 🚦 Final review checkpoint**

Stop. Report every file changed across all four milestones, the full test count, and anything from
the definition-of-done checklist still outstanding. Do not commit.

---

## Deferred

Not in this plan, per the design's §13:

- Any write action, including "run now". `IRecurringBackgroundJobTrigger<TJob>` needs a 17.5.0 floor.
- Persisted recurring job history.
- Server attribution for distributed jobs.
- Outcome for distributed jobs, which is impossible rather than deferred.
- Run duration and history charts.
- Clock-aligned next run for `AlignToClock` jobs.
