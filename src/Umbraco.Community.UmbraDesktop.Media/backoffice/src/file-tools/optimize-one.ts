import { findOnDesktop } from '../edit-image/desktop-windows.js';
import { OPTIMIZE_SERVICE_CONTEXT } from '../shared/optimize-service.js';
import type { FileToolItem } from './item.js';

/**
 * Optimize on one media item (#176): the Optimize images window of #139 for this image, named after
 * it rather than its folder, since a run of one is about the image. The service is found on the
 * desktop page or through the window's frame, as the bulk action finds it, and the run is let go: its
 * window says how it went.
 * @param element Where the action is.
 * @param item The item.
 */
export function optimizeOne(element: Element, item: FileToolItem): void {
  const service = findOnDesktop(element, OPTIMIZE_SERVICE_CONTEXT);
  void service?.optimizeMedia({ items: [item.unique], title: item.name }).catch(() => undefined);
}
