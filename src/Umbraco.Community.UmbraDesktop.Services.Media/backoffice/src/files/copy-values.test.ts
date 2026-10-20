import { expect } from '@open-wc/testing';
import { copiedValues } from './copy-values.js';

/**
 * The values a full copy is created with (#137, edit-image design §11.6): every property of the
 * item it is a copy of, with the new file in `umbracoFile`. Umbraco has no copy for media, so this is
 * the Media Manager's copy again, for one item whose file is already new.
 */

/** A value as the media detail repository returns it. */
const valueOf = (alias: string, editorAlias: string, value: unknown) => ({
  alias,
  editorAlias,
  value,
  culture: null,
  segment: null,
  entityType: 'media-property-value',
});

/** An image with a focal point, a named crop, its derived labels, alt text and a second file. */
const image = [
  valueOf('umbracoFile', 'Umbraco.ImageCropper', {
    src: '/media/a/beach.jpg',
    focalPoint: { left: 0.3, top: 0.6 },
    crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: { x1: 0.1, y1: 0.2, x2: 0.1, y2: 0.2 } }],
  }),
  valueOf('umbracoWidth', 'Umbraco.Label', 1600),
  valueOf('umbracoHeight', 'Umbraco.Label', 1200),
  valueOf('umbracoBytes', 'Umbraco.Label', 2_000_000),
  valueOf('umbracoExtension', 'Umbraco.Label', 'jpg'),
  valueOf('altText', 'Umbraco.TextBox', 'A beach at dusk'),
  valueOf('licence', 'Umbraco.UploadField', { src: '/media/b/licence.pdf' }),
];

/** A re-upload that answers with a temporary file named after the address it was given. */
const reupload = async (src: string) => `copy-of-${src}`;

/** The copy's value for an alias. */
const find = (values: ReadonlyArray<{ alias: string; value: unknown }> | undefined, alias: string) =>
  values?.find((value) => value.alias === alias)?.value;

it('keeps every property, and leaves out the labels the server works out from the new file', async () => {
  const { values } = await copiedValues(image, 't1', false, reupload);
  expect(values?.map((value) => value.alias)).to.deep.equal(['umbracoFile', 'altText', 'licence']);
  expect(find(values, 'altText')).to.equal('A beach at dusk');
});

it("points the file property at the new file, keeping the original's focal point and crops", async () => {
  const { values } = await copiedValues(image, 't1', false, reupload);
  expect(find(values, 'umbracoFile')).to.deep.equal({
    temporaryFileId: 't1',
    focalPoint: { left: 0.3, top: 0.6 },
    crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: { x1: 0.1, y1: 0.2, x2: 0.1, y2: 0.2 } }],
  });
});

it('resets the focal point and the crop coordinates of a copy made after a crop, rotate or flip', async () => {
  const { values } = await copiedValues(image, 't1', true, reupload);
  expect(find(values, 'umbracoFile')).to.deep.equal({
    temporaryFileId: 't1',
    focalPoint: null,
    crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: null }],
  });
});

/**
 * Pointing at the original's file would share it, and deleting the original deletes the file, so the
 * copy's other files are copies too, as the Media Manager's are. One that cannot be copied (missing on
 * disk, too big to upload again, on another host) is left out and named, so the copy is still made
 * and the person is told (owner, 2026-10-20).
 */
it('gives every other file its own copy, and leaves out and names one that cannot be made', async () => {
  const copied = await copiedValues(image, 't1', false, reupload);
  expect(find(copied.values, 'licence')).to.deep.equal({ temporaryFileId: 'copy-of-/media/b/licence.pdf' });
  expect(copied.leftOut).to.deep.equal([]);
  const missing = await copiedValues(image, 't1', false, async () => undefined);
  expect(missing.values.map((value) => value.alias)).to.deep.equal(['umbracoFile', 'altText']);
  expect(missing.leftOut).to.deep.equal(['licence']);
});

it('never changes the original', async () => {
  const before = JSON.stringify(image);
  await copiedValues(image, 't1', true, reupload);
  expect(JSON.stringify(image)).to.equal(before);
});
