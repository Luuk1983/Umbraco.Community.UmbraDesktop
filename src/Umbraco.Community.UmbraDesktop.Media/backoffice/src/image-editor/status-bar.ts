import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { MAX_ZOOM, MIN_ZOOM } from './geometry.js';
import { STATUS_BAR_HEIGHT } from './constants.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/**
 * The zoom slider's position for a zoom: logarithmic, so every step from 5% to 800% is the same
 * distance along it, as in the Photos apps.
 * @param zoom The zoom.
 * @returns 0 to 100.
 */
export function sliderFor(zoom: number): number {
  return (Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * 100;
}

/**
 * The zoom for a slider position.
 * @param value 0 to 100.
 * @returns The zoom.
 */
export function zoomFor(value: number): number {
  return MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (value / 100);
}

/**
 * A file size the way the File page writes it: decimal units, one decimal only in megabytes. A copy
 * of Services.Media's `formatBytes`, as nothing is imported between packages.
 * @param bytes The size.
 * @param locale The language.
 * @returns The size.
 */
export function formatBytes(bytes: number, locale: string): string {
  const number = (value: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  if (bytes < 1000) return `${number(bytes, 0)} B`;
  if (bytes < 1_000_000) return `${number(bytes / 1000, 0)} KB`;
  return `${number(bytes / 1_000_000, 1)} MB`;
}

/**
 * A format's name for people. A copy of Services.Media's `formatLabel`.
 * @param extension The extension.
 * @returns The name.
 */
export function formatLabel(extension: string): string {
  const lower = extension.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return 'JPEG';
  if (lower === 'webp') return 'WebP';
  return lower.toUpperCase();
}

/**
 * The status bar: the item's name, editable, which renames it on save; its folder; its size as it
 * will be saved, "before → after" while a resize is pending; its file size and format; what the
 * editor last said; and zoom at the right (design §4, D5).
 * @param editor The editor.
 * @returns The bar.
 */
export function renderStatusBar(editor: UmbraDesktopImageEditorElement): TemplateResult {
  const doc = editor.filePageDocument;
  const notice = editor.notice;
  const lang = editor.localize.lang();
  const zoom = editor.zoom;
  const pending = editor.pendingSize;
  const facts = doc
    ? html`<input
          type="text"
          name="name"
          class="name"
          aria-label=${editor.words('name')}
          .value=${doc.name}
          @input=${(event: Event) => editor.rename((event.target as HTMLInputElement).value)} />
        <span class="muted">${editor.words('inFolder', doc.folderName ?? editor.words('root'))}</span>
        <span class="dimensions"
          >${pending && (pending.w !== doc.width || pending.h !== doc.height)
            ? editor.words('dimensionsPending', doc.width, doc.height, pending.w, pending.h)
            : editor.words('dimensions', doc.width, doc.height)}</span
        >
        <span class="muted">${formatBytes(doc.bytes, lang)} ${formatLabel(doc.extension)}</span>`
    : html`<span class="muted">${editor.words('noImage')}</span>`;
  return html`<div class="status">
    <span class="facts">${facts}</span>
    ${notice ? html`<span class="notice ${notice.kind}" role="status">${notice.text}</span>` : html`<span class="notice"></span>`}
    <span class="zoom" role="group" aria-label=${editor.words('zoom')}>
      <button
        type="button"
        data-command="zoom-out"
        title=${editor.words('zoomOut')}
        aria-label=${editor.words('zoomOut')}
        ?disabled=${!doc}
        @click=${() => editor.stepZoom(-1)}>
        <umb-icon name="icon-zoom-out"></umb-icon>
      </button>
      <input
        type="range"
        data-command="zoom-slider"
        aria-label=${editor.words('zoom')}
        min="0"
        max="100"
        step="0.1"
        .value=${String(sliderFor(zoom))}
        ?disabled=${!doc}
        @input=${(event: Event) => editor.setZoom(zoomFor(Number((event.target as HTMLInputElement).value)))} />
      <button
        type="button"
        data-command="zoom-in"
        title=${editor.words('zoomIn')}
        aria-label=${editor.words('zoomIn')}
        ?disabled=${!doc}
        @click=${() => editor.stepZoom(1)}>
        <umb-icon name="icon-zoom-in"></umb-icon>
      </button>
      <span class="value" data-command="zoom-value">${doc ? `${Math.round(zoom * 100)}%` : nothing}</span>
      <button type="button" data-command="zoom-fit" class="fit" ?disabled=${!doc} @click=${() => editor.fit()}>
        ${editor.words('fit')}
      </button>
    </span>
  </div>`;
}

/** The status bar's styles. */
export const statusBarStyles = css`
  .status {
    flex: 0 0 ${STATUS_BAR_HEIGHT}px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .status .facts {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    overflow: hidden;
  }

  .status .name {
    flex: 0 1 12em;
    min-width: 5em;
    height: ${STATUS_BAR_HEIGHT - 10}px;
    padding: 0 6px;
    font: inherit;
    font-weight: 700;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border: none;
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  .status .notice {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status .notice.error {
    font-weight: 700;
  }

  .status .zoom {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status .zoom button {
    display: inline-grid;
    place-items: center;
    min-width: ${STATUS_BAR_HEIGHT - 8}px;
    height: ${STATUS_BAR_HEIGHT - 8}px;
    padding: 0 4px;
    font: inherit;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: transparent;
    border: none;
    border-radius: var(--umbradesktop-app-radius, 3px);
    cursor: pointer;
  }

  .status .zoom button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .status .zoom button.fit {
    padding: 0 8px;
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .status .zoom input[type='range'] {
    width: 96px;
    accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .status .zoom .value {
    min-width: 3.5em;
    text-align: right;
  }

  .status button:focus-visible,
  .status input:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }
`;
