import type { ElementLoaderProperty } from '@umbraco-cms/backoffice/extension-api';
import type { UmbraDesktopApp } from '../types';

/**
 * Reading an app's request for a dialog over its window (#179), sent with
 * `UMBRADESKTOP_APP_OPEN_DIALOG_EVENT`. Its own file, as an app's request for a page beside its window
 * is in `attached-page.ts`: the event's detail comes from a package, so it is read field by field
 * rather than trusted.
 */

/**
 * The dialog app for a request, or undefined when the request does not read: no content, no name, or
 * no size with both sides above zero. A dialog is never resized, so its size is the one it asked for.
 * @param windowId The window the dialog keeps waiting.
 * @param detail The event's detail.
 * @returns The app.
 */
export function dialogApp(windowId: string, detail: unknown): UmbraDesktopApp | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const { name, icon, element, props, size } = detail as Record<string, unknown>;
  if (!element || typeof name !== 'string' || !name) return undefined;
  const { w, h } = (size ?? {}) as { w?: unknown; h?: unknown };
  if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) return undefined;
  return {
    alias: `umbradesktop-dialog:${windowId}`,
    name,
    icon: typeof icon === 'string' && icon ? icon : 'icon-alert',
    content: {
      kind: 'element',
      element: element as ElementLoaderProperty,
      props: props && typeof props === 'object' ? (props as Record<string, unknown>) : undefined,
    },
    chromeProfile: 'bare',
    defaultSize: { w, h },
    resizable: false,
  };
}
