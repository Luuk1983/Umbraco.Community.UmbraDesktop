import { html } from '@umbraco-cms/backoffice/external/lit';
import { linkedResize, presetSizes } from '../geometry.js';
import { outputSize } from '../state.js';
import type { Size } from '../state.js';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';
import type { ModeModule } from './mode.js';

/** What Resize keeps while it is the mode. */
interface ResizeSettings {
  /** Whether width and height keep the picture's proportions. */
  linked: boolean;
  /** Whether the fields are in pixels or in percent of the picture now. */
  units: 'pixels' | 'percent';
}

/** The settings Resize keeps between visits, on the editor. */
function settings(editor: UmbraDesktopImageEditorElement): ResizeSettings {
  return (editor.modeState.resize ??= { linked: true, units: 'pixels' }) as ResizeSettings;
}

/** @returns The picture's size before the pending resize: as it will be saved now. */
function before(editor: UmbraDesktopImageEditorElement): Size | undefined {
  const state = editor.state;
  return state ? outputSize(state) : undefined;
}

/**
 * A field was typed in: the pending size follows, the other side too while linked.
 * @param editor The editor.
 * @param side Which field.
 * @param typed What it says, in the fields' units.
 */
function typed(editor: UmbraDesktopImageEditorElement, side: 'w' | 'h', typed: number): void {
  const now = before(editor);
  if (!now || !Number.isFinite(typed) || typed <= 0) return;
  const own = settings(editor);
  const pixels = own.units === 'percent' ? (now[side] * typed) / 100 : typed;
  const from = editor.pendingSize ?? now;
  // Linked sides keep the proportions of the picture itself, not of an unlinked pending size.
  const base = own.linked ? now : from;
  const next = linkedResize(base, { [side]: pixels }, own.linked);
  editor.pendingSize = own.linked ? next : { ...from, [side]: next[side] };
}

/**
 * Apply the pending size as one step, if it changes anything.
 * @param editor The editor.
 */
function applySize(editor: UmbraDesktopImageEditorElement): void {
  const state = editor.state;
  const pending = editor.pendingSize;
  editor.pendingSize = null;
  if (!state || !pending) return;
  const now = outputSize(state);
  if (pending.w === now.w && pending.h === now.h) return;
  editor.apply({ ...state, size: pending });
}

/**
 * Resize mode (design §4.1). The new size is pending, shown as "before → after" in the status bar,
 * until Apply size or another mode applies it. The common widths only shrink; a larger size can be
 * typed.
 */
export const resizeMode: ModeModule = {
  leave(editor) {
    applySize(editor);
  },

  key(editor, event) {
    if (event.key !== 'Enter' || !editor.pendingSize) return false;
    applySize(editor);
    return true;
  },

  panel(editor) {
    const own = settings(editor);
    const now = before(editor) ?? { w: 1, h: 1 };
    const size = editor.pendingSize ?? now;
    const shown = (side: 'w' | 'h') =>
      own.units === 'percent' ? String(Math.round((size[side] / now[side]) * 1000) / 10) : String(size[side]);
    const field = (side: 'w' | 'h', name: 'width' | 'height') => html`<label class="field">
      <span>${editor.words(name)}</span>
      <input
        type="number"
        name=${name}
        min="1"
        step="1"
        inputmode="numeric"
        .value=${shown(side)}
        @input=${(event: Event) => {
          typed(editor, side, Number((event.target as HTMLInputElement).value));
          editor.requestUpdate();
        }}
        @keydown=${(event: KeyboardEvent) => {
          // Enter in the field applies what was typed, as it would submit a form.
          if (event.key !== 'Enter') return;
          event.preventDefault();
          applySize(editor);
        }} />
    </label>`;
    return html`
      <section class="box">
        <h4>${editor.words('size')}</h4>
        <div class="row size-row">
          ${field('w', 'width')}
          <button
            type="button"
            class="square"
            data-command="link"
            title=${editor.words('keepProportions')}
            aria-label=${editor.words('keepProportions')}
            aria-pressed=${own.linked ? 'true' : 'false'}
            @click=${() => {
              own.linked = !own.linked;
              editor.requestUpdate();
            }}>
            <umb-icon name=${own.linked ? 'icon-link' : 'icon-unlink'}></umb-icon>
          </button>
          ${field('h', 'height')}
        </div>
        <div class="segmented">
          ${(['pixels', 'percent'] as const).map(
            (units) => html`<button
              type="button"
              data-command="units-${units}"
              aria-pressed=${own.units === units ? 'true' : 'false'}
              @click=${() => {
                own.units = units;
                editor.requestUpdate();
              }}>
              ${editor.words(units)}
            </button>`,
          )}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('commonWidths')}</h4>
        <div class="row">
          ${presetSizes(now).map(
            (preset) => html`<button
              type="button"
              data-command="preset-${preset.key}"
              ?disabled=${!preset.enabled}
              aria-pressed=${editor.pendingSize?.w === preset.size.w && editor.pendingSize?.h === preset.size.h ? 'true' : 'false'}
              @click=${() => {
                editor.pendingSize = preset.size;
              }}>
              ${preset.key === 'half' ? editor.words('half') : preset.key}
            </button>`,
          )}
        </div>
      </section>
      <p class="muted">${editor.words('resizeHint')}</p>
      <div class="actions">
        <button type="button" data-command="resize-reset" @click=${() => (editor.pendingSize = null)}>${editor.words('reset')}</button>
        <button type="button" class="primary" data-command="resize-apply" @click=${() => applySize(editor)}>
          ${editor.words('applySize')}
        </button>
      </div>
    `;
  },
};
