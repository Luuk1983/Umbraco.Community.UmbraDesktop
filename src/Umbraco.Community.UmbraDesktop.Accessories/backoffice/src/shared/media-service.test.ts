import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { MediaService } from './media-service.js';
import type { MediaSaveRequest } from './media-service.js';

/** The desktop, which the media service's context sits on in production. */
@customElement('umbradesktop-accessories-media-test-desktop')
class TestDesktop extends UmbLitElement {}

/** An accessory inside it. */
@customElement('umbradesktop-accessories-media-test-app')
class TestApp extends UmbLitElement {}

/** A stand-in for the media service's context, provided under its published alias. */
class FakeMediaContext extends UmbContextBase {
  /** What each method was called with. */
  calls: string[] = [];

  /** @param host The desktop stand-in. */
  constructor(host: UmbControllerHost) {
    super(host, new UmbContextToken('UmbraDesktopMediaContext'));
  }

  /** @returns A cancelled open. */
  async open() {
    this.calls.push('open');
    return { status: 'cancelled' as const };
  }

  /**
   * @param request What to save.
   * @returns A saved answer.
   */
  async save(request: MediaSaveRequest) {
    this.calls.push(`save:${request.name}`);
    return { ok: true as const, unique: 'm1' };
  }

  /** @returns A chosen folder. */
  async pickSaveFolder() {
    this.calls.push('pick');
    return { status: 'chosen' as const, folder: 'f1' };
  }

  /**
   * @param name The item's name.
   * @returns Yes.
   */
  async confirmOverwrite(name: string) {
    this.calls.push(`confirm:${name}`);
    return true;
  }
}

/**
 * An accessory on a desktop stand-in, with or without the media service on it.
 * @param withService Whether to provide the service's context.
 * @returns The app's line to the service, and the fake context when there is one.
 */
async function mount(withService: boolean) {
  const desktop = await fixture<TestDesktop>(html`<umbradesktop-accessories-media-test-desktop
    ><umbradesktop-accessories-media-test-app></umbradesktop-accessories-media-test-app
  ></umbradesktop-accessories-media-test-desktop>`);
  const context = withService ? new FakeMediaContext(desktop) : undefined;
  const app = desktop.querySelector('umbradesktop-accessories-media-test-app') as TestApp;
  return { media: new MediaService(app, { waitMs: 20 }), context };
}

/** A save request to vary. */
const request = (name: string): MediaSaveRequest => ({ file: new File(['x'], `${name}.txt`), name, folder: null });

it('reaches the media service by its published alias and passes each call through', async () => {
  const { media, context } = await mount(true);
  expect(await media.open()).to.deep.equal({ status: 'cancelled' });
  expect(await media.save(request('Notes'))).to.deep.equal({ ok: true, unique: 'm1' });
  expect(await media.pickSaveFolder()).to.deep.equal({ status: 'chosen', folder: 'f1' });
  expect(await media.confirmOverwrite('Notes')).to.equal(true);
  expect(context!.calls).to.deep.equal(['open', 'save:Notes', 'pick', 'confirm:Notes']);
});

/**
 * Without the service (a broken install, or one that failed to load) nothing is opened and nothing is
 * saved, and the person is told so rather than left clicking a button that does nothing. Save As
 * answers the root so the save goes ahead to the saver, which is where the reason is given; it never
 * writes anything there.
 */
it('says the media library cannot be reached when the service is missing', async () => {
  const { media } = await mount(false);
  expect(await media.open()).to.deep.equal({ status: 'failed' });
  expect(await media.pickSaveFolder()).to.deep.equal({ status: 'chosen', folder: null });
  const saved = await media.save(request('Notes'));
  expect(saved.ok).to.equal(false);
  expect(saved.ok === false && saved.message).to.equal('The media library cannot be reached.');
  expect(await media.confirmOverwrite('Notes')).to.equal(false);
});
