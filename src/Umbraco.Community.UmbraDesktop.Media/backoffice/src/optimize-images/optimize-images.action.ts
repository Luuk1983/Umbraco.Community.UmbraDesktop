import { UmbEntityBulkActionBase } from '@umbraco-cms/backoffice/entity-bulk-action';
import { findOnDesktop } from '../edit-image/desktop-windows.js';
import { OPTIMIZE_SERVICE_CONTEXT } from '../shared/optimize-service.js';

/**
 * Optimize images in core's selection bar of a media collection (#139, design §4): the selection,
 * folders and all, handed to the media service, which opens an Optimize images window for the run.
 * Sorting out what can be optimized is the run's job, so the count on its settings and its report
 * agree.
 *
 * It returns at once rather than waiting for the run, so the selection bar is free again while the
 * run goes on in its own window. The service is found on the desktop page, as in a Media Manager
 * window, or through the window's frame, as in the Media section's window; its conditions show the
 * action only where one of the two is there.
 */
export class UmbraDesktopOptimizeImagesAction extends UmbEntityBulkActionBase<never> {
  /** Start a run on the selection, and let it go. */
  override async execute(): Promise<void> {
    if (!this.selection.length) return;
    const service = findOnDesktop(this.getHostElement(), OPTIMIZE_SERVICE_CONTEXT);
    void service?.optimizeMedia({ items: [...this.selection] }).catch(() => undefined);
  }
}

export { UmbraDesktopOptimizeImagesAction as api };
