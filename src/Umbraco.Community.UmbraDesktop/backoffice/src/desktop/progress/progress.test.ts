import { expect } from '@open-wc/testing';
import {
  applyTaskReport,
  isBusy,
  progressCaption,
  summariseTasks,
  taskFromUploads,
  UMBRADESKTOP_UPLOAD_TASK_LABEL,
} from './progress';
import type { UmbraDesktopTask } from './progress';

/**
 * The rules that decide what a busy window draws. Pure, so they are pinned here before any element
 * draws them: every surface reads the summary these functions produce, and a rule that is wrong here
 * is wrong on all of them at once. Design §2.
 */

/** A stand-in localizer that shows which key was asked for and with what. */
const term = (key: string, ...args: unknown[]) => (args.length ? `${key}(${args.join(',')})` : key);

/** A stand-in for `localize.string`: a `#key` resolves to the key, plain text passes through. */
const text = (value: string) => (value.startsWith('#') ? value.slice(1) : value);

describe('summariseTasks', () => {
  it('says nothing for a window with no tasks', () => {
    expect(summariseTasks([])).to.equal(undefined);
  });

  it('draws a known total as a proportion', () => {
    const summary = summariseTasks([{ id: 'a', state: 'running', completed: 14, total: 50 }]);
    expect(summary?.state).to.equal('determinate');
    expect(summary?.fraction).to.be.closeTo(0.28, 1e-9);
    expect(summary?.completed).to.equal(14);
    expect(summary?.total).to.equal(50);
  });

  it('sums several tasks into one state rather than two bars', () => {
    const summary = summariseTasks([
      { id: 'a', state: 'running', completed: 4, total: 10 },
      { id: 'b', state: 'running', completed: 10, total: 40 },
    ]);
    expect(summary?.state).to.equal('determinate');
    expect(summary?.completed).to.equal(14);
    expect(summary?.total).to.equal(50);
    expect(summary?.fraction).to.be.closeTo(0.28, 1e-9);
  });

  it('draws work with no known total as activity, without a percentage', () => {
    const summary = summariseTasks([{ id: 'a', state: 'running' }]);
    expect(summary?.state).to.equal('indeterminate');
    expect(summary?.fraction).to.equal(undefined);
    expect(summary?.total).to.equal(undefined);
  });

  it('goes indeterminate when any running task has no total, rather than inventing a percentage', () => {
    const summary = summariseTasks([
      { id: 'a', state: 'running', completed: 9, total: 10 },
      { id: 'b', state: 'running' },
    ]);
    expect(summary?.state).to.equal('indeterminate');
    expect(summary?.fraction).to.equal(undefined);
  });

  it('lets running win over failed, so a failure only shows once nothing is running', () => {
    const summary = summariseTasks([
      { id: 'a', state: 'failed', completed: 5, total: 5, failed: 2 },
      { id: 'b', state: 'running', completed: 1, total: 4 },
    ]);
    expect(summary?.state).to.equal('determinate');
    expect(summary?.total).to.equal(4);
    expect(summary?.failed).to.equal(2);
  });

  it('leaves a visible end state when the work failed', () => {
    const summary = summariseTasks([{ id: 'a', state: 'failed', completed: 31, total: 50, failed: 3 }]);
    expect(summary?.state).to.equal('failed');
    expect(summary?.failed).to.equal(3);
    expect(summary?.fraction).to.be.closeTo(0.62, 1e-9);
  });

  it('draws a failure with no counts as a whole ring rather than an empty one', () => {
    const summary = summariseTasks([{ id: 'a', state: 'failed' }]);
    expect(summary?.state).to.equal('failed');
    expect(summary?.fraction).to.equal(1);
  });

  it('keeps a label every running task agrees on, and drops one they do not', () => {
    const upload: UmbraDesktopTask = { id: 'a', state: 'running', label: 'x' };
    expect(summariseTasks([upload])?.label).to.equal('x');
    expect(summariseTasks([upload, { id: 'b', state: 'running', label: 'y' }])?.label).to.equal(undefined);
  });

  it('never draws past the end, whatever a source reports', () => {
    const summary = summariseTasks([{ id: 'a', state: 'running', completed: 12, total: 10 }]);
    expect(summary?.fraction).to.equal(1);
  });

  it('counts only whole items, while the fraction keeps the part-done one moving', () => {
    const summary = summariseTasks([{ id: 'a', state: 'running', completed: 2.5, total: 4 }]);
    expect(summary?.completed).to.equal(2);
    expect(summary?.fraction).to.be.closeTo(0.625, 1e-9);
  });
});

describe('isBusy', () => {
  it('is true while something runs and false for a failure or nothing', () => {
    expect(isBusy(summariseTasks([{ id: 'a', state: 'running' }]))).to.equal(true);
    expect(isBusy(summariseTasks([{ id: 'a', state: 'running', completed: 1, total: 2 }]))).to.equal(true);
    expect(isBusy(summariseTasks([{ id: 'a', state: 'failed' }]))).to.equal(false);
    expect(isBusy(undefined)).to.equal(false);
  });
});

describe('taskFromUploads', () => {
  it('reports nothing for a dropzone that has uploaded nothing', () => {
    expect(taskFromUploads([])).to.equal(undefined);
  });

  it('counts finished files and lets a part-uploaded one move the fraction', () => {
    const task = taskFromUploads([
      { status: 'complete' },
      { status: 'waiting', progress: 50 },
      { status: 'waiting', progress: 0 },
      { status: 'waiting' },
    ]);
    expect(task?.state).to.equal('running');
    expect(task?.total).to.equal(4);
    expect(task?.completed).to.be.closeTo(1.5, 1e-9);
    expect(task?.label).to.equal(UMBRADESKTOP_UPLOAD_TASK_LABEL);
  });

  it('counts a failed file as processed, and as a failure', () => {
    const task = taskFromUploads([{ status: 'error' }, { status: 'not allowed' }, { status: 'waiting', progress: 0 }]);
    expect(task?.state).to.equal('running');
    expect(task?.completed).to.equal(2);
    expect(task?.failed).to.equal(2);
  });

  it('ends failed when nothing is waiting and something did not upload', () => {
    const task = taskFromUploads([{ status: 'complete' }, { status: 'error' }]);
    expect(task?.state).to.equal('failed');
    expect(task?.failed).to.equal(1);
  });

  it('reports nothing once everything finished, so the marker clears', () => {
    expect(taskFromUploads([{ status: 'complete' }, { status: 'complete' }])).to.equal(undefined);
  });

  it('treats a cancelled file as finished rather than failed: somebody chose that', () => {
    expect(taskFromUploads([{ status: 'cancelled' }, { status: 'complete' }])).to.equal(undefined);
  });
});

describe('progressCaption', () => {
  it('names the work and how far it has got', () => {
    const summary = summariseTasks([
      { id: 'a', state: 'running', completed: 14, total: 50, label: UMBRADESKTOP_UPLOAD_TASK_LABEL },
    ]);
    expect(progressCaption(summary, term, text)).to.equal('umbraDesktop_progressUploading umbraDesktop_progressCount(14,50)');
  });

  it('names labelled work with no total without a count', () => {
    const summary = summariseTasks([{ id: 'a', state: 'running', label: 'Rendering' }]);
    expect(progressCaption(summary, term, text)).to.equal('Rendering');
  });

  it('falls back to a generic word for work nobody labelled', () => {
    expect(progressCaption(summariseTasks([{ id: 'a', state: 'running', completed: 1, total: 3 }]), term, text)).to.equal(
      'umbraDesktop_progressWorking umbraDesktop_progressCount(1,3)',
    );
  });

  it('gives no count when there is no total', () => {
    expect(progressCaption(summariseTasks([{ id: 'a', state: 'running' }]), term, text)).to.equal(
      'umbraDesktop_progressWorking',
    );
  });

  it('says how many failed out of how many, once the work has ended', () => {
    const summary = summariseTasks([{ id: 'a', state: 'failed', completed: 50, total: 50, failed: 3 }]);
    expect(progressCaption(summary, term, text)).to.equal('umbraDesktop_progressFailedCount(3,50)');
  });

  it('says it failed when there is nothing to count', () => {
    expect(progressCaption(summariseTasks([{ id: 'a', state: 'failed' }]), term, text)).to.equal(
      'umbraDesktop_progressFailed',
    );
  });

  it('is empty for an idle window', () => {
    expect(progressCaption(undefined, term, text)).to.equal('');
  });
});

describe('applyTaskReport', () => {
  it('starts a task, updates it in place and ends it', () => {
    let tasks = applyTaskReport([], { id: 'render', state: 'running', completed: 0, total: 3 });
    expect(tasks).to.deep.equal([{ id: 'render', state: 'running', completed: 0, total: 3 }]);
    tasks = applyTaskReport(tasks, { id: 'render', state: 'running', completed: 2, total: 3 });
    expect(tasks).to.have.lengthOf(1);
    expect(tasks[0].completed).to.equal(2);
    tasks = applyTaskReport(tasks, { id: 'render', state: 'done' });
    expect(tasks).to.deep.equal([]);
  });

  it('keeps a failed task until the app ends it', () => {
    let tasks = applyTaskReport([], { id: 'a', state: 'failed', failed: 1 });
    expect(tasks[0].state).to.equal('failed');
    tasks = applyTaskReport(tasks, { id: 'a', state: 'done' });
    expect(tasks).to.deep.equal([]);
  });

  it('keeps tasks apart by id', () => {
    const tasks = applyTaskReport(applyTaskReport([], { id: 'a', state: 'running' }), { id: 'b', state: 'running' });
    expect(tasks.map((t) => t.id)).to.deep.equal(['a', 'b']);
  });

  it('ignores a report it cannot read rather than drawing nonsense', () => {
    const start = [{ id: 'a', state: 'running' as const }];
    for (const bad of [undefined, null, 'x', {}, { id: '' , state: 'running' }, { id: 'b', state: 'paused' }, { id: 'b', state: 'running', total: -1 }, { id: 'b', state: 'running', completed: Number.NaN }]) {
      expect(applyTaskReport(start, bad), JSON.stringify(bad)).to.equal(start);
    }
  });

  it('keeps only the fields it knows, so an app cannot smuggle anything onto the model', () => {
    const [task] = applyTaskReport([], { id: 'a', state: 'running', label: 'Rendering', extra: 1 });
    expect(task).to.deep.equal({ id: 'a', state: 'running', label: 'Rendering' });
  });
});
