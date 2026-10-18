import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';

/** The five modes, in the order the mode bar shows them (design D1). */
export type Mode = 'crop' | 'adjust' | 'markup' | 'redact' | 'resize';

/** The modes, in mode bar order. */
export const MODES: readonly Mode[] = ['crop', 'adjust', 'markup', 'redact', 'resize'];

/**
 * One mode: its panel, and what it does on the canvas while it is the mode.
 *
 * The panel is a template function of the editor, as the plan has it, so a mode holds no state of
 * its own that the editor cannot see: what a mode has pending (a crop frame, a size) is the editor's,
 * where switching mode can apply it.
 */
export interface ModeModule {
  /**
   * The mode's panel.
   * @param editor The editor.
   * @returns The panel's content.
   */
  panel(editor: UmbraDesktopImageEditorElement): TemplateResult;
  /**
   * What the mode draws over the canvas in HTML rather than on it: labels and markers that read
   * better as text than as canvas pixels, positioned from the stage's transform.
   * @param editor The editor.
   * @returns The overlay's content.
   */
  overlay?(editor: UmbraDesktopImageEditorElement): TemplateResult;
  /**
   * Put the mode's objects on the canvas, as the mode becomes the mode or the picture changes.
   * @param editor The editor.
   */
  enter?(editor: UmbraDesktopImageEditorElement): void;
  /**
   * Apply what the mode has pending as one step, and take its objects off the canvas, as another
   * mode becomes the mode, the file menu opens, or the editor saves.
   * @param editor The editor.
   */
  leave?(editor: UmbraDesktopImageEditorElement): void;
  /**
   * A key the editor did not handle itself.
   * @param editor The editor.
   * @param event The key.
   * @returns True when the mode handled it.
   */
  key?(editor: UmbraDesktopImageEditorElement, event: KeyboardEvent): boolean;
}
