import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { WordKey } from '../shared/words.js';
import { MODE_BAR_HEIGHT } from './constants.js';
import { MODES } from './modes/mode.js';
import type { Mode } from './modes/mode.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/** Each mode's label and icon. */
const MODE_FACE: Record<Mode, { label: WordKey; icon: string }> = {
  crop: { label: 'modeCrop', icon: 'icon-crop' },
  adjust: { label: 'modeAdjust', icon: 'icon-contrast' },
  markup: { label: 'modeMarkup', icon: 'icon-edit' },
  redact: { label: 'modeRedact', icon: 'icon-block' },
  resize: { label: 'modeResize', icon: 'icon-resize' },
};

/**
 * The mode bar: File, undo and redo, the five modes, and Save at the right (design D1, D2, D3).
 *
 * **Drawn and disabled, never hidden**: with nothing open the modes, undo, redo and Save are all
 * there and greyed, so the person sees what the editor will offer. Save is enabled only while there
 * is something to save, as the mocks draw it.
 * @param editor The editor.
 * @returns The bar.
 */
export function renderModeBar(editor: UmbraDesktopImageEditorElement): TemplateResult {
  const open = editor.hasDocument;
  const history = editor.history;
  const filing = editor.filing;
  return html`<div class="bar ${filing ? 'filing' : ''}" role="toolbar" aria-label=${editor.words('imageEditor')}>
    <button
      type="button"
      class="tab file"
      data-command="file"
      aria-pressed=${filing ? 'true' : 'false'}
      @click=${() => editor.showFile('open')}>
      <umb-icon name="icon-folder-open"></umb-icon><span>${editor.words('file')}</span>
    </button>
    <span class="separator" aria-hidden="true"></span>
    <button
      type="button"
      class="icon"
      data-command="undo"
      title=${editor.words('undo')}
      aria-label=${editor.words('undo')}
      ?disabled=${!open || !history?.canUndo}
      @click=${() => editor.undo()}>
      <umb-icon name="icon-undo"></umb-icon>
    </button>
    <button
      type="button"
      class="icon"
      data-command="redo"
      title=${editor.words('redo')}
      aria-label=${editor.words('redo')}
      ?disabled=${!open || !history?.canRedo}
      @click=${() => editor.redo()}>
      <umb-icon name="icon-redo"></umb-icon>
    </button>
    <span class="tabs" role="group" aria-label=${editor.words('modes')}>
      ${MODES.map(
        (mode) => html`<button
          type="button"
          class="tab"
          data-command="mode-${mode}"
          aria-pressed=${open && !filing && editor.mode === mode ? 'true' : 'false'}
          ?disabled=${!open}
          @click=${() => editor.setMode(mode)}>
          <umb-icon name=${MODE_FACE[mode].icon}></umb-icon><span>${editor.words(MODE_FACE[mode].label)}</span>
        </button>`,
      )}
    </span>
    <button
      type="button"
      class="save"
      data-command="save"
      ?disabled=${!open || !editor.dirty}
      @click=${() => void editor.save()}>
      <umb-icon name="icon-save"></umb-icon><span>${editor.words('save')}</span>
    </button>
  </div>`;
}

/** The mode bar's styles, in the desktop's app tokens. */
export const modeBarStyles = css`
  .bar {
    flex: 0 0 ${MODE_BAR_HEIGHT}px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    min-width: 0;
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .bar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: ${MODE_BAR_HEIGHT - 10}px;
    padding: 0 10px;
    font: inherit;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: transparent;
    border: none;
    border-radius: var(--umbradesktop-app-radius, 3px);
    cursor: pointer;
    white-space: nowrap;
  }

  .bar button umb-icon {
    font-size: 18px;
  }

  .bar button.icon {
    width: ${MODE_BAR_HEIGHT - 10}px;
    padding: 0;
  }

  .bar button:not(:disabled):hover {
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
  }

  .bar button[aria-pressed='true'] {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    font-weight: 700;
  }

  .bar button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .bar button:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: -2px;
  }

  .bar .separator {
    flex: none;
    width: 1px;
    height: ${MODE_BAR_HEIGHT - 20}px;
    margin: 0 4px;
    background: var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .bar .tabs {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }

  .bar.filing .tabs button {
    opacity: 0.6;
  }

  .bar button.save {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    font-weight: 700;
  }

  .bar button.save:disabled {
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    color: var(--umbradesktop-app-text, var(--uui-color-text));
  }
`;
