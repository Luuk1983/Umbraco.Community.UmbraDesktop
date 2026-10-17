import { fixture, html } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { FileEncoder, FilePageDocument, FilePageName, FileSaveOutcome, SaveFormat } from '../shared/file-page.js';
import type { OpenedMedia } from '../shared/media-service.js';
import { IMAGE_EDITOR_CONTENT_SIZE } from './constants.js';
import './image-editor.element.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/**
 * What the editor's tests stand on: a fake of Services.Media's File page under its real tag, a fake
 * media context under its published alias, and a mounted editor in a window-sized box. Nothing here
 * reaches a backoffice; the File page's own behaviour is Services.Media's to test.
 */

/** A stand-in File page that records what the editor asks of it and answers as the real one does. */
export class FakeFilePage extends HTMLElement {
  document: FilePageDocument | null = null;
  dirty = false;
  accept: string[] = [];
  encode?: FileEncoder;
  preview?: string;
  resetFocalPoint = false;
  /** The pages shown, in order. */
  shown: Array<{ page: FilePageName; format?: SaveFormat }> = [];
  /** How many times `save()` was called. */
  saves = 0;
  /** What the next `save()` answers, unless the format cannot be kept. */
  answer: FileSaveOutcome = { status: 'cancelled' };

  get open(): boolean {
    return this.hasAttribute('open');
  }
  set open(value: boolean) {
    this.toggleAttribute('open', value);
  }

  show(page: FilePageName, options: { format?: SaveFormat } = {}): void {
    this.shown.push({ page, ...options });
    this.open = true;
  }

  hide(): void {
    this.open = false;
  }

  async save(): Promise<FileSaveOutcome> {
    this.saves++;
    if (this.document && !['jpg', 'jpeg', 'png', 'webp'].includes(this.document.extension)) {
      this.show('saveAs', { format: 'png' });
      return { status: 'needs-save-as' };
    }
    return this.answer;
  }

  /**
   * Fire one of the page's events, as the real page does.
   * @param name The event's name, without the `umbradesktop-media-file-` prefix.
   * @param detail What it carries.
   */
  fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(`umbradesktop-media-file-${name}`, { detail, bubbles: true, composed: true }));
  }
}

/** Registers the fake under the File page's tag, once per test page. */
export function defineFakeFilePage(): void {
  if (!customElements.get('umbradesktop-media-file-page')) customElements.define('umbradesktop-media-file-page', FakeFilePage);
}

/**
 * A host that provides a fake media context, as the desktop element would. It slots its children,
 * because an element with a shadow root and no slot does not lay its children out at all, and the
 * editor measures its own box.
 */
@customElement('umbradesktop-image-editor-test-host')
export class TestHost extends UmbLitElement {
  override render() {
    return html`<slot></slot>`;
  }
}

/** The media context's published alias, as another package builds its token. */
const MEDIA = new UmbContextToken<UmbContextMinimal>('UmbraDesktopMediaContext');

/**
 * An editor mounted in a box of its default size, with the media context provided or not.
 * @param options Whether to provide the context.
 * @returns The editor and its fake File page.
 */
export async function mountEditor(options: { media?: boolean } = {}) {
  const host = await fixture<TestHost>(
    html`<umbradesktop-image-editor-test-host
      style="display: flex; flex-direction: column; width: ${IMAGE_EDITOR_CONTENT_SIZE.w}px; height: ${IMAGE_EDITOR_CONTENT_SIZE.h}px"
    ></umbradesktop-image-editor-test-host>`,
  );
  if (options.media !== false) host.provideContext(MEDIA, { open: async () => ({ status: 'cancelled' }), getHostElement: () => host } as UmbContextMinimal);
  const editor = document.createElement('umbradesktop-image-editor') as UmbraDesktopImageEditorElement;
  editor.style.flex = '1';
  host.appendChild(editor);
  await editor.updateComplete;
  await settle(editor);
  const page = editor.shadowRoot!.querySelector('umbradesktop-media-file-page') as FakeFilePage | null;
  return { host, editor, page };
}

/**
 * Let the editor finish what it started: decoding, a render, a frame.
 * @param editor The editor.
 */
export async function settle(editor: UmbraDesktopImageEditorElement): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await editor.updateComplete;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * A fixture file as an opened media item.
 * @param name The file in `fixtures/`.
 * @param overrides Fields to change.
 * @returns The opened file.
 */
export async function opened(name: string, overrides: Partial<OpenedMedia> = {}): Promise<OpenedMedia> {
  const response = await fetch(new URL(`./fixtures/${name}`, import.meta.url));
  const blob = await response.blob();
  return {
    unique: 'k1',
    name: 'Beach',
    blob,
    extension: name.split('.').pop()!,
    updateDate: 'd1',
    folder: 'f1',
    folderName: 'Holidays',
    focalPoint: { left: 0.25, top: 0.5 },
    ...overrides,
  };
}

/**
 * Open a fixture in the editor through its File page, as a pick from the media library would.
 * @param editor The editor.
 * @param page Its File page.
 * @param name The fixture.
 * @param overrides Fields to change.
 */
export async function openFixture(
  editor: UmbraDesktopImageEditorElement,
  page: FakeFilePage,
  name = 'picture.png',
  overrides: Partial<OpenedMedia> = {},
): Promise<void> {
  const before = editor.picture;
  page.fire('open', await opened(name, overrides));
  // The first open on a test page also starts Fabric's GPU filtering, which takes longer than a few
  // ticks; wait for the picture itself, up to a limit, rather than for a guessed number of them.
  const deadline = performance.now() + 5000;
  while (editor.picture === before && !editor.notice && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await settle(editor);
}

/**
 * A control in the editor, by its command.
 * @param editor The editor.
 * @param command The `data-command` of the control.
 * @returns The control, or null.
 */
export function control<T extends HTMLElement = HTMLButtonElement>(editor: HTMLElement, command: string): T {
  return editor.shadowRoot!.querySelector(`[data-command="${command}"]`) as T;
}

/**
 * Press a key on the editor, as the keyboard would.
 * @param editor The editor.
 * @param key The key.
 * @param modifiers Ctrl and Shift.
 * @param target Where the key lands; the editor itself by default.
 */
export function press(
  editor: HTMLElement,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean } = {},
  target: EventTarget = editor,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}
