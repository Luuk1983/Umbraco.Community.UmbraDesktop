import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { WordKey } from '../shared/words.js';
import {
  BAR_BUTTON_HEIGHT,
  CURRENT_LINE,
  HOVER_WASH,
  MODE_BAR_HEIGHT,
  TAB_GAP,
  TAB_ICON_SIZE,
  TAB_LABEL_HEIGHT,
} from './constants.js';
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
 * The mode bar: undo and redo, the five modes in the middle, and Save and "..." together in the right
 * corner (design D1, D11, D13). "..." opens Services.Media's file menu, with Open, Save as, Info and
 * Close; Save stays one click.
 *
 * **Two looks that must never be mistaken for each other.** The mode in use is a tab with a line
 * under it, as Umbraco marks its own tabs; Save is the view's main action, in its own colours. Both
 * were the accent once, and Save read as the selected tab (§13).
 *
 * **Drawn and disabled, never hidden**: with nothing open the modes, undo, redo and Save are all
 * there and greyed, so the person sees what the editor will offer. Save is enabled only while there
 * is something to save. "..." always works, for Open and Close.
 * @param editor The editor.
 * @returns The bar.
 */
export function renderModeBar(editor: UmbraDesktopImageEditorElement): TemplateResult {
  const open = editor.hasDocument;
  const history = editor.history;
  return html`<div class="bar" role="toolbar" aria-label=${editor.words('imageEditor')}>
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
          aria-pressed=${open && editor.mode === mode ? 'true' : 'false'}
          ?disabled=${!open}
          @click=${() => editor.setMode(mode)}>
          <umb-icon name=${MODE_FACE[mode].icon}></umb-icon><span>${editor.words(MODE_FACE[mode].label)}</span>
        </button>`,
      )}
    </span>
    <button type="button" class="save" data-command="save" ?disabled=${!open || !editor.dirty} @click=${() => void editor.save()}>
      ${editor.words('save')}
    </button>
    <button
      type="button"
      class="icon"
      data-command="more"
      title=${editor.words('more')}
      aria-label=${editor.words('more')}
      aria-haspopup="dialog"
      aria-expanded=${editor.menuOpen ? 'true' : 'false'}
      @click=${() => editor.showMenu()}>
      <uui-symbol-more></uui-symbol-more>
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
    height: ${BAR_BUTTON_HEIGHT}px;
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

  /* Umbraco's own three dots, as on its entity action menus: not an icon, whose names hold no dots. */
  .bar button uui-symbol-more {
    font-size: 18px;
    color: inherit;
  }

  .bar button.icon {
    width: ${BAR_BUTTON_HEIGHT}px;
    padding: 0;
  }

  /* Under the pointer a plain button or a tab takes a wash of the text colour, which shows on any
     theme's ground (two surface tokens were tried first, and the owner could barely see either).
     Save keeps its own colours and darkens instead: a ground would sit under its light text and hide
     it (found in a real backoffice). */
  .bar button:not(:disabled):not(.save):hover {
    background: color-mix(in srgb, var(--umbradesktop-app-text, var(--uui-color-text)) ${HOVER_WASH}%, transparent);
  }

  .bar button.save:not(:disabled):hover {
    filter: brightness(0.9);
  }

  .bar button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .bar button:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: -2px;
  }

  .bar .tabs {
    flex: 1;
    display: flex;
    justify-content: center;
    align-self: stretch;
    gap: 2px;
    min-width: 0;
  }

  /* A mode is a tab in Umbraco's own look: the icon over its name, the full height of the bar, and
     a line under the one in use (D13). */
  .bar button.tab {
    flex-direction: column;
    gap: ${TAB_GAP}px;
    height: 100%;
    min-width: 72px;
    padding: 0 12px;
    font-size: 13px;
    line-height: ${TAB_LABEL_HEIGHT}px;
    border-radius: 0;
  }

  /* A box of its own size, so the room round it is the bar's to give and not the icon font's. */
  .bar button.tab umb-icon {
    display: block;
    flex: none;
    width: ${TAB_ICON_SIZE}px;
    height: ${TAB_ICON_SIZE}px;
    font-size: ${TAB_ICON_SIZE}px;
  }

  .bar button.tab[aria-pressed='true'] {
    font-weight: 700;
    box-shadow: inset 0 -${CURRENT_LINE}px 0 0 var(--umbradesktop-app-current, var(--uui-color-current));
  }

  /* Save, the main action: Umbraco's green Save in the Umbraco themes, each other theme's own default
     button. Beside "...", in the corner (D11). */
  .bar button.save {
    margin-left: 4px;
    padding: 0 18px;
    font-weight: 700;
    background: var(--umbradesktop-app-action, var(--uui-color-positive));
    color: var(--umbradesktop-app-action-text, var(--uui-color-positive-contrast));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, transparent);
    box-shadow: inset var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-width, 1px) 0
      var(--umbradesktop-app-edge-light, transparent);
  }
`;
