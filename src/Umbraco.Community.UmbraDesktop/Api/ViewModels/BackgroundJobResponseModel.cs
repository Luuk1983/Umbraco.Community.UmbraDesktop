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
