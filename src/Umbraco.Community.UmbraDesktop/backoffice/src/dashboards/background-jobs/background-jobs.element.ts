import { UmbraDesktopService } from '../../api/sdk.gen';
import type { BackgroundJobResponseModel } from '../../api/types.gen';
import {
  describeNextRun,
  formatPeriod,
  groupJobsByKind,
  NO_VALUE,
  runsOnAnyServer,
  toRelativeTime,
  UMBRADESKTOP_CLOCK_INTERVAL_MS,
  UMBRADESKTOP_DEFAULT_REFRESH_INTERVAL_MS,
  UMBRADESKTOP_REFRESH_INTERVALS_MS,
} from './background-jobs-format';
import {
  css,
  customElement,
  html,
  ifDefined,
  nothing,
  query,
  repeat,
  state,
} from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { isProblemDetailsLike, tryExecute, UmbApiError } from '@umbraco-cms/backoffice/resources';
import type { UmbProblemDetails } from '@umbraco-cms/backoffice/resources';

/** The one state that is never worth a badge: it is what almost every job reports, almost always. */
const IDLE_STATE = 'Idle';

/**
 * The outcomes the recurring table's legend explains, in the order a reader meets them: the two
 * that say something happened, the one that says it deliberately did not, and the absence.
 * `Unavailable` is left out because it only ever applies to distributed jobs, whose table has no
 * outcome column at all.
 */
const LEGEND_OUTCOMES = ['Succeeded', 'Failed', 'Ignored', 'NotObserved'];

/**
 * <summary>
 * Read-only viewer listing every background job Umbraco has registered — both the
 * distributed (database-backed, cross-server) jobs and the recurring per-server jobs this
 * package observes itself. Polls the report endpoint every 5 seconds while the browser tab is
 * visible so the tables stay current without a manual refresh, though a refresh button is also
 * offered for an immediate pull.
 * </summary>
 * <remarks>
 * The two kinds are rendered as separate tables because they can answer different questions.
 * Umbraco records nothing about how a distributed run ended and distributed jobs carry no server
 * roles, so those two columns exist only for the recurring table; showing them empty on ten
 * distributed rows was most of the screen's width for none of its information.
 *
 * Recurring-job activity (last run / next run / last outcome) is tracked in an in-memory cache on
 * the server. It resets whenever the application pool recycles, so a freshly restarted site will
 * show "Not since restart" for every recurring job until each has run at least once — this is
 * expected, not a bug in the viewer, and the note above that table says so.
 * </remarks>
 */
@customElement('umbradesktop-background-jobs')
export class UmbraDesktopBackgroundJobsElement extends UmbLitElement {
  @state()
  private _jobs: Array<BackgroundJobResponseModel> = [];

  @state()
  private _monitoringSince: string | null = null;

  @state()
  private _loading = true;

  /**
   * The moment every relative time is measured against, advanced once a second. Held in state
   * rather than read inside `render()` so that Lit actually re-renders as it moves.
   */
  @state()
  private _now = Date.now();

  /**
   * How often the report is re-fetched, in milliseconds. Also the tolerance {@link describeNextRun}
   * reads a next run through, since it is exactly how stale the rendered data can be.
   */
  @state()
  private _refreshIntervalMs: number = UMBRADESKTOP_DEFAULT_REFRESH_INTERVAL_MS;

  /**
   * The problem details of the most recent failed fetch, or `undefined` if the most recent fetch
   * succeeded. Cleared on every successful load. Rendering distinguishes "never loaded successfully
   * yet" (`_monitoringSince === null`) from "a later refresh failed" so a persistent failure on
   * first load is never silently indistinguishable from an empty-but-healthy table.
   */
  @state()
  private _error?: UmbProblemDetails;

  #clockTimer?: ReturnType<typeof setInterval>;

  /**
   * The dropdown holding the interval choices, so choosing one can close it. Typed structurally
   * rather than as `UmbDropdownElement`: the element is registered globally by the backoffice and
   * never imported here, so importing its type only to close a popover would be the one reason
   * this file depended on it.
   */
  @query('#interval-picker')
  private _intervalPicker?: { open: boolean };

  /** Clock ticks since the last fetch, used to fetch once the chosen interval has elapsed. */
  #ticks = 0;

  override connectedCallback() {
    super.connectedCallback();
    this.#loadReport();
    this.#ticks = 0;
    // One timer drives both the clock and the poll, so a countdown can never be rendered out of
    // phase with the data it counts down to.
    this.#clockTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this._now = Date.now();
      this.#ticks += 1;
      if (this.#ticks >= this._refreshIntervalMs / UMBRADESKTOP_CLOCK_INTERVAL_MS) {
        this.#ticks = 0;
        this.#loadReport();
      }
    }, UMBRADESKTOP_CLOCK_INTERVAL_MS);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#clockTimer) {
      clearInterval(this.#clockTimer);
      this.#clockTimer = undefined;
    }
  }

  /**
   * Loads (or reloads) the background-job report. A failed request leaves the current rows in
   * place — `render()` is responsible for surfacing the failure instead of blanking the tables.
   * Notifications are suppressed here (`disableNotifications: true`) so the poll never spams a
   * toast per tick; the element captures `error` itself instead so it can render its own
   * inline states.
   */
  async #loadReport() {
    const { data, error } = await tryExecute(this, UmbraDesktopService.getBackgroundJobs(), {
      disableNotifications: true,
    });

    if (data) {
      this._jobs = data.jobs;
      this._monitoringSince = data.monitoringSince;
      this._error = undefined;
    } else {
      this._error = this.#toProblemDetails(error);
    }

    this._loading = false;
  }

  /**
   * Normalises whatever `tryExecute` handed back into `UmbProblemDetails` (if possible), so
   * `render()` has one shape to read a status code and message from regardless of whether the
   * request rejected (an `UmbApiError`, whose problem details live under `.problemDetails`) or
   * resolved with a non-2xx response (already problem-details-shaped, per the generated client).
   */
  #toProblemDetails(error: unknown): UmbProblemDetails | undefined {
    if (!error) return undefined;
    if (UmbApiError.isUmbApiError(error)) return error.problemDetails;
    if (isProblemDetailsLike(error)) return error;
    // Fallback for anything else tryExecute might hand back, so a real failure is never
    // silently treated as success just because it wasn't problem-details-shaped.
    return {
      type: 'error',
      title: error instanceof Error ? error.message : 'An unknown error occurred.',
      status: 0,
    };
  }

  /**
   * Switches the refresh interval and pulls straight away, so choosing a faster rate takes effect
   * now rather than after the previous, slower interval has finished elapsing.
   */
  #onIntervalClick(intervalMs: number) {
    this._refreshIntervalMs = intervalMs;
    if (this._intervalPicker) {
      this._intervalPicker.open = false;
    }
    this.#ticks = 0;
    this.#loadReport();
  }

  /** "Every second" / "Every 10 seconds", for one entry in the interval picker. */
  #intervalLabel(intervalMs: number) {
    const seconds = intervalMs / 1000;
    return seconds === 1
      ? this.localize.term('umbraDesktop_backgroundJobsIntervalOne')
      : this.localize.term('umbraDesktop_backgroundJobsInterval', [seconds]);
  }

  /** The picker's own label, which doubles as the statement of what the view is currently doing. */
  #currentIntervalLabel() {
    const seconds = this._refreshIntervalMs / 1000;
    return seconds === 1
      ? this.localize.term('umbraDesktop_backgroundJobsRefreshingEveryOne')
      : this.localize.term('umbraDesktop_backgroundJobsRefreshingEvery', [seconds]);
  }

  /**
   * Renders a timestamp as a distance from now, with the exact moment on hover. A countdown
   * answers "is this due soon, or is it stuck" directly, which is the question the screen exists
   * for; the absolute time is what you need only when correlating against a log, so it is one
   * hover away rather than occupying the cell.
   * @param timestamp The ISO timestamp to render, if there is one.
   * @param absentLabel What to show instead when there is not.
   */
  #renderRelative(timestamp: string | null | undefined, absentLabel: string) {
    if (!timestamp) {
      return html`<span class="muted">${absentLabel}</span>`;
    }
    const moment = new Date(timestamp);
    const { value, unit } = toRelativeTime(moment, new Date(this._now));
    return html`<span title=${this.localize.dateTime(moment)}>
      ${this.localize.relativeTime(value, unit, { numeric: 'auto' })}
    </span>`;
  }

  /**
   * Renders a next run, reading "due now" while it falls inside the window the report cannot see
   * through. The clock advances every second but the data behind it is up to a poll old, so a
   * plain countdown runs past zero and starts announcing a *next* run in the past — which is what
   * a job with a five-second period does almost permanently.
   * @param timestamp The expected next run, if the job has one.
   */
  #renderNextRun(timestamp: string | null | undefined) {
    if (!timestamp) {
      return html`<span class="muted">${NO_VALUE}</span>`;
    }
    const moment = new Date(timestamp);
    const next = describeNextRun(moment, new Date(this._now), this._refreshIntervalMs);
    const label =
      next.kind === 'due'
        ? this.localize.term('umbraDesktop_backgroundJobsDueNow')
        : this.localize.relativeTime(next.value, next.unit, { numeric: 'auto' });
    return html`<span title=${this.localize.dateTime(moment)}>${label}</span>`;
  }

  /** Renders the localized job count beside a group heading, singular where that reads better. */
  #renderCount(count: number) {
    return count === 1
      ? this.localize.term('umbraDesktop_backgroundJobsJobCountOne')
      : this.localize.term('umbraDesktop_backgroundJobsJobCount', [count]);
  }

  /**
   * Renders a job's state as a badge beside its name, and renders nothing at all when the job is
   * idle. Idle is the overwhelming majority of rows at any moment, so a column for it would spend
   * width to report that nothing is happening; the exceptions are what deserve to stand out.
   */
  #renderStateBadge(jobState: string) {
    if (jobState === IDLE_STATE) return nothing;
    return html`<span class="badge badge-${jobState.toLowerCase()}">${this.#formatState(jobState)}</span>`;
  }

  #formatState(jobState: string) {
    switch (jobState) {
      case 'Running':
        return this.localize.term('umbraDesktop_backgroundJobsStateRunning');
      case 'Stale':
        return this.localize.term('umbraDesktop_backgroundJobsStateStale');
      case 'Manual':
        return this.localize.term('umbraDesktop_backgroundJobsStateManual');
      default:
        return jobState;
    }
  }

  /**
   * Renders an outcome as a coloured glyph carrying its wording as a tooltip and accessible name.
   * The five outcomes are a fixed, tiny vocabulary repeated on every row, which is what an icon
   * is for; spelled out, the longest of them was wider than the job names beside it.
   */
  #renderOutcome(outcome: string, decorative = false) {
    const label = this.#formatOutcome(outcome);
    // In the legend the wording is already beside the glyph, so naming it again would have a
    // screen reader read every entry twice.
    const naming = decorative
      ? { role: undefined, title: undefined, ariaLabel: undefined }
      : { role: 'img', title: label, ariaLabel: label };
    const glyph = (icon: string, tone: string) => html`
      <span
        class="outcome ${tone}"
        role=${ifDefined(naming.role)}
        title=${ifDefined(naming.title)}
        aria-label=${ifDefined(naming.ariaLabel)}>
        <uui-icon name=${icon}></uui-icon>
      </span>
    `;

    switch (outcome) {
      case 'Succeeded':
        return glyph('icon-check', 'ok');
      case 'Failed':
        return glyph('icon-alert', 'fail');
      case 'Ignored':
        return glyph('icon-next', 'skip');
      default:
        // Unavailable and NotObserved are both "nothing to report", which a glyph would overstate.
        return html`<span class="muted" title=${ifDefined(naming.title)} aria-label=${ifDefined(naming.ariaLabel)}
          >${NO_VALUE}</span
        >`;
    }
  }

  /**
   * Renders the key to the outcome glyphs, shown once under the recurring group's explanation.
   * Built by calling the row renderer itself rather than by listing the glyphs again, so the
   * legend cannot drift from what the rows actually draw.
   */
  #renderOutcomeLegend() {
    return html`
      <ul class="legend">
        ${LEGEND_OUTCOMES.map(
          (outcome) => html`
            <li>${this.#renderOutcome(outcome, true)}<span>${this.#formatOutcome(outcome)}</span></li>
          `,
        )}
      </ul>
    `;
  }

  #formatOutcome(outcome: string) {
    switch (outcome) {
      case 'Unavailable':
        return this.localize.term('umbraDesktop_backgroundJobsOutcomeUnavailable');
      case 'NotObserved':
        return this.localize.term('umbraDesktop_backgroundJobsOutcomeNotObserved');
      case 'Succeeded':
        return this.localize.term('umbraDesktop_backgroundJobsOutcomeSucceeded');
      case 'Failed':
        return this.localize.term('umbraDesktop_backgroundJobsOutcomeFailed');
      case 'Ignored':
        return this.localize.term('umbraDesktop_backgroundJobsOutcomeIgnored');
      default:
        return outcome;
    }
  }

  /**
   * Renders which servers a job is willing to run on. A job listing every role is unrestricted,
   * so it says so in two words instead of four role names; a job that is genuinely restricted
   * spells its roles out, because on a load-balanced install that is the interesting case.
   */
  #formatServerRoles(serverRoles: Array<string>) {
    if (serverRoles.length === 0) return NO_VALUE;
    if (runsOnAnyServer(serverRoles)) {
      return this.localize.term('umbraDesktop_backgroundJobsAnyServer');
    }
    return this.localize.list(serverRoles.map((role) => this.#formatServerRole(role)));
  }

  #formatServerRole(role: string) {
    switch (role) {
      case 'Unknown':
        return this.localize.term('umbraDesktop_backgroundJobsRoleUnknown');
      case 'Single':
        return this.localize.term('umbraDesktop_backgroundJobsRoleSingle');
      case 'SchedulingPublisher':
        return this.localize.term('umbraDesktop_backgroundJobsRoleSchedulingPublisher');
      case 'Subscriber':
        return this.localize.term('umbraDesktop_backgroundJobsRoleSubscriber');
      default:
        return role;
    }
  }

  /** The name cell, shared by both tables: the job name plus a badge when it is not idle. */
  #renderNameCell(job: BackgroundJobResponseModel) {
    return html`<uui-table-cell title=${job.typeName}>
      <span class="job-name">${job.name}</span>${this.#renderStateBadge(job.state)}
    </uui-table-cell>`;
  }

  #renderDistributedRow = (job: BackgroundJobResponseModel) => html`
    <uui-table-row>
      ${this.#renderNameCell(job)}
      <uui-table-cell>${formatPeriod(job.periodSeconds)}</uui-table-cell>
      <uui-table-cell>
        ${this.#renderRelative(job.lastRun, this.localize.term('umbraDesktop_backgroundJobsNeverRun'))}
      </uui-table-cell>
      <uui-table-cell>${this.#renderNextRun(job.nextRun)}</uui-table-cell>
    </uui-table-row>
  `;

  #renderRecurringRow = (job: BackgroundJobResponseModel) => html`
    <uui-table-row>
      ${this.#renderNameCell(job)}
      <uui-table-cell>${formatPeriod(job.periodSeconds)}</uui-table-cell>
      <uui-table-cell>
        ${this.#renderRelative(job.lastRun, this.localize.term('umbraDesktop_backgroundJobsNeverRun'))}
      </uui-table-cell>
      <uui-table-cell class="outcome-cell">${this.#renderOutcome(job.lastOutcome)}</uui-table-cell>
      <uui-table-cell>${this.#renderNextRun(job.nextRun)}</uui-table-cell>
      <uui-table-cell class="muted">${this.#formatServerRoles(job.serverRoles)}</uui-table-cell>
    </uui-table-row>
  `;

  /**
   * Renders one kind as a heading, an explanation and a table, or nothing when that kind has no
   * jobs. The explanation is the point of grouping: it is where "Umbraco does not record this"
   * gets said once instead of on every row.
   * @param headingTerm Localization key for the group heading.
   * @param noteTerm Localization key for the sentence explaining the kind.
   * @param jobs The jobs of that kind, in the order the server sent them.
   * @param head The table's header cells.
   * @param renderRow How to render one row of this kind.
   * @param afterNote Anything belonging with the explanation, such as the outcome legend.
   */
  #renderGroup(
    headingTerm: string,
    noteTerm: string,
    jobs: Array<BackgroundJobResponseModel>,
    head: TemplateResult,
    renderRow: (job: BackgroundJobResponseModel) => TemplateResult,
    afterNote: TemplateResult | typeof nothing = nothing,
  ) {
    if (jobs.length === 0) return nothing;
    return html`
      <uui-box
        class="group"
        headline=${this.localize.term(headingTerm)}
        headline-variant="h2">
        <span slot="header" class="count">${this.#renderCount(jobs.length)}</span>
        <p class="group-note">${this.localize.term(noteTerm)}</p>
        ${afterNote}
        <div class="table-container">
          <uui-table>
            <uui-table-head>${head}</uui-table-head>
            ${repeat(jobs, (job) => job.typeName, renderRow)}
          </uui-table>
        </div>
      </uui-box>
    `;
  }

  #renderTables() {
    const { distributed, recurring } = groupJobsByKind(this._jobs);

    const distributedHead = html`
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsName')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsPeriod')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsLastRun')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsNextRun')}</uui-table-head-cell>
    `;

    const recurringHead = html`
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsName')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsPeriod')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsLastRun')}</uui-table-head-cell>
      <uui-table-head-cell class="outcome-cell" title=${this.localize.term('umbraDesktop_backgroundJobsLastOutcome')}>
        <span class="visually-hidden">${this.localize.term('umbraDesktop_backgroundJobsLastOutcome')}</span>
      </uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsNextRun')}</uui-table-head-cell>
      <uui-table-head-cell>${this.localize.term('umbraDesktop_backgroundJobsRunsOn')}</uui-table-head-cell>
    `;

    return html`
      ${this.#renderGroup(
        'umbraDesktop_backgroundJobsKindDistributed',
        'umbraDesktop_backgroundJobsDistributedNote',
        distributed,
        distributedHead,
        this.#renderDistributedRow,
      )}
      ${this.#renderGroup(
        'umbraDesktop_backgroundJobsKindRecurring',
        'umbraDesktop_backgroundJobsRecurringNote',
        recurring,
        recurringHead,
        this.#renderRecurringRow,
        this.#renderOutcomeLegend(),
      )}
    `;
  }

  /**
   * The intro, with the interval picker beside it. The picker's label states how often the screen
   * is refreshing, which is part of explaining what you are looking at, so the two belong on one
   * row; it is centred against the paragraph rather than pinned to its top edge, which left it
   * sitting above the first line of text rather than with it.
   *
   * There is no manual refresh button. The view already refreshes on its own, and in a desktop
   * window the chrome carries a refresh control of its own, so a third one said nothing.
   * @remarks
   * `umb-dropdown`'s `label` property is only the accessible name — it is forwarded to the inner
   * button's `.label`, not rendered. Visible text has to go in the `label` slot, and without it the
   * control draws as a bare expand caret.
   */
  #renderHeader() {
    return html`
      <div id="header">
        <p id="intro">${this.localize.term('umbraDesktop_backgroundJobsIntro')}</p>
        <umb-dropdown
          id="interval-picker"
          look="outline"
          label=${this.#currentIntervalLabel()}
          title=${this.localize.term('umbraDesktop_backgroundJobsChooseInterval')}>
          <span slot="label">${this.#currentIntervalLabel()}</span>
          ${UMBRADESKTOP_REFRESH_INTERVALS_MS.map(
            (intervalMs) => html`
              <uui-menu-item
                label=${this.#intervalLabel(intervalMs)}
                ?active=${intervalMs === this._refreshIntervalMs}
                @click-label=${() => this.#onIntervalClick(intervalMs)}></uui-menu-item>
            `,
          )}
        </umb-dropdown>
      </div>
    `;
  }

  #renderFooter() {
    if (!this._monitoringSince) return nothing;
    // The refresh rate used to be stated here too; the interval picker's own label says it now.
    return html`<p id="footer">
      ${this.localize.term('umbraDesktop_backgroundJobsMonitoringSince', [
        this.localize.dateTime(new Date(this._monitoringSince)),
      ])}
    </p>`;
  }

  /** A brief "status: message" suffix for an error box, when the failed request carried problem details. */
  #renderErrorDetail() {
    if (!this._error) return nothing;
    const detail = this._error.detail || this._error.title;
    if (!detail) return nothing;
    return html`<p class="error-detail">
      ${this._error.status ? html`<strong>${this._error.status}</strong> — ` : nothing}${detail}
    </p>`;
  }

  /** State 2: the very first load failed and there is nothing previously rendered to fall back to. */
  #renderFailedFirstLoad() {
    return html`
      ${this.#renderHeader()}
      <uui-box class="message-box">
        <div class="message-row danger">
          <uui-icon name="icon-alert"></uui-icon>
          <div>
            <p>${this.localize.term('umbraDesktop_backgroundJobsLoadFailed')}</p>
            ${this.#renderErrorDetail()}
            <p>${this.localize.term('umbraDesktop_backgroundJobsRetrying')}</p>
          </div>
        </div>
      </uui-box>
    `;
  }

  /** State 3: a later refresh failed, but the tables still show the last successful result. */
  #renderRefreshFailedWarning() {
    return html`
      <uui-box class="message-box">
        <div class="message-row warning">
          <uui-icon name="icon-alert"></uui-icon>
          <div>
            <p>${this.localize.term('umbraDesktop_backgroundJobsRefreshFailed')}</p>
            ${this.#renderErrorDetail()}
          </div>
        </div>
      </uui-box>
    `;
  }

  /** State 4: the request succeeded, but Umbraco has no background jobs registered — a legitimate, non-error state. */
  #renderEmptyState() {
    return html`<uui-box class="message-box"><p>${this.localize.term('umbraDesktop_backgroundJobsEmpty')}</p></uui-box>`;
  }

  override render() {
    // State 1: first load still in flight.
    if (this._loading) {
      return html`<uui-loader></uui-loader>`;
    }

    // State 2: nothing has ever loaded successfully, and the current attempt failed — do not
    // render the (empty) tables, since they would look like a working-but-empty dashboard rather
    // than a broken one.
    const hasLoadedOnce = this._monitoringSince !== null;
    if (this._error && !hasLoadedOnce) {
      return this.#renderFailedFirstLoad();
    }

    // States 3 & 4: we have a previous successful result to show (possibly zero jobs). If the
    // most recent refresh failed, add a non-destructive warning above it — the rows themselves
    // are never blanked.
    return html`
      ${this.#renderHeader()}
      ${this._error ? this.#renderRefreshFailedWarning() : nothing}
      ${this._jobs.length === 0 ? this.#renderEmptyState() : this.#renderTables()}
      ${this.#renderFooter()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-layout-1);
        box-sizing: border-box;
      }

      /* Intro left, interval picker right, centred against the paragraph rather than aligned to
         its top edge: with one control beside two lines of text, top alignment reads as the button
         floating above the sentence. They wrap onto separate lines rather than squeezing the
         control once the window is too narrow to hold both. */
      #header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-4) var(--uui-size-layout-1);
        margin-bottom: var(--uui-size-layout-1);
      }

      #intro {
        flex: 1 1 30ch;
        margin: 0;
        color: var(--uui-color-text);
      }

      #interval-picker {
        flex: 0 0 auto;
      }

      .group {
        display: block;
      }

      .group + .group {
        margin-top: var(--uui-size-layout-1);
      }

      /* Sits in the box's header row, immediately after the headline. */
      .count {
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }

      .group-note {
        margin: 0 0 var(--uui-size-space-3);
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }

      /* The key to the outcome column, sitting with the explanation it belongs to rather than
         under the table, where a reader meets the glyphs before anything has named them. */
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-2) var(--uui-size-space-5);
        margin: 0 0 var(--uui-size-space-4);
        padding: 0;
        list-style: none;
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }

      .legend li {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      /* No border of its own: the box around it is already the frame, and a second one inside
         the first reads as a mistake. */
      .table-container {
        overflow-x: auto;
        max-width: 100%;
      }

      /* Enough for the widest of the two tables; below it the container scrolls rather than
         letting the backoffice's own table squeeze columns into unreadable wraps. */
      uui-table {
        min-width: 640px;
      }

      .job-name {
        font-weight: bold;
      }

      .badge {
        display: inline-block;
        margin-left: var(--uui-size-space-3);
        padding: 0 var(--uui-size-space-3);
        border-radius: 1em;
        background: var(--uui-color-surface-alt);
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
        font-weight: bold;
        white-space: nowrap;
      }

      .badge-running {
        background: var(--uui-color-positive);
        color: var(--uui-color-selected-contrast);
      }

      .badge-stale {
        background: var(--uui-color-warning);
        color: var(--uui-color-warning-contrast);
      }

      .outcome-cell {
        width: 1%;
        text-align: center;
      }

      .outcome {
        display: inline-flex;
      }

      .outcome.ok {
        color: var(--uui-color-positive-standalone);
      }

      .outcome.fail {
        color: var(--uui-color-danger-standalone);
      }

      .outcome.skip {
        color: var(--uui-color-text-alt);
      }

      .muted {
        color: var(--uui-color-text-alt);
      }

      /* The outcome column's header is the icons themselves; the word still has to reach a
         screen reader, so it is present but not painted. */
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      #footer {
        margin-top: var(--uui-size-space-4);
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }

      uui-loader {
        display: block;
        margin: var(--uui-size-layout-1) auto;
      }

      .message-box {
        display: block;
        margin-bottom: var(--uui-size-space-4);
      }

      .message-row {
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-4);
      }

      .message-row p {
        margin: 0;
      }

      .message-row p + p {
        margin-top: var(--uui-size-space-2);
      }

      .message-row uui-icon {
        flex: 0 0 auto;
      }

      .message-row.danger uui-icon {
        color: var(--uui-color-danger-standalone);
      }

      .message-row.warning uui-icon {
        color: var(--uui-color-warning-standalone);
      }

      .error-detail {
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopBackgroundJobsElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-background-jobs': UmbraDesktopBackgroundJobsElement;
  }
}
