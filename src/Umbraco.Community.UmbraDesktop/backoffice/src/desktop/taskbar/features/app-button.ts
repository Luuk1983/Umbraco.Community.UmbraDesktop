import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbraDesktopApp } from '../../types';
import type { UmbraDesktopTaskbarFeatureContext } from './types';

/**
 * One app's button in the feature row: the launcher's tile for that app, in a second place.
 *
 * **It calls `open()` and has no logic of its own, and must not grow any.** The second-click rule
 * is already solved in `window-manager.context.ts`, which branches on the app's `allowMultiple`:
 * an app that forbids a second window gets its existing one focused and restored, anything else
 * gets another window. Putting a focus-if-open rule here instead would take second windows away
 * from every app in the catalogue, all of which allow them today.
 *
 * **No running indicator**, unlike the equivalent button on Windows. There it returns you to the
 * window, so the indicator explains the click; here a second click opens a second window for every
 * app but one, so an indicator would be a lie. The duplicate it would be resolving is only a
 * duplicate of *icon* anyway: with the app open there is a window button beside this one showing
 * the same glyph, but that one carries a title and this one never does.
 *
 * The `task` class is the running-window button's own, which is what gets this button themed
 * without a line of CSS in any of the five themes. It draws no `task-label`, so the three themes
 * that show labels give it an icon-only button of their own idiom, and the two that hide labels
 * already draw icon-only tiles.
 * @param app The app this button launches.
 * @param context The taskbar's view of the world, for localisation and for `open`.
 * @returns The button's template.
 */
export function taskbarAppButton(app: UmbraDesktopApp, context: UmbraDesktopTaskbarFeatureContext): TemplateResult {
  // The tooltip *and* the accessible name, because the row shows no labels at all: without this
  // the whole row is unreadable to a screen reader and unguessable to anyone who does not already
  // know the icon.
  const name = context.localize(app.name);
  return html`
    <button class="task" title=${name} aria-label=${name} @click=${() => context.open(app)}>
      <umb-icon class="task-icon" name=${app.icon}></umb-icon>
    </button>
  `;
}
