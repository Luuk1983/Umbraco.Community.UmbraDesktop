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
}
