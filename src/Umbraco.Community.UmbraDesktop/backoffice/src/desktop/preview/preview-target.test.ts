import { expect } from '@open-wc/testing';
import { previewTargetFromPath } from './preview-target';

/**
 * What the preview opens is read off the document window's route: the document's GUID and the
 * variant the editor is working in. The paths below follow core's document workspace routes; the
 * browser checks confirm them against a running backoffice.
 */

const GUID = 'ca4249ed-2b23-4337-b522-63cabe5587d1';

it('reads the document and its culture from an edit route', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/content`)).to.deep.equal({
    unique: GUID,
    culture: 'en-US',
    segment: undefined,
  });
});

it('reads an invariant document as having no culture', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/invariant`)).to.deep.equal({
    unique: GUID,
    culture: undefined,
    segment: undefined,
  });
});

it('reads a segment after the culture', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/da-DK_members`)).to.deep.equal({
    unique: GUID,
    culture: 'da-DK',
    segment: 'members',
  });
});

it('takes the first variant of a split view, which is the one being edited on the left', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US_&_da-DK/view/content`)).to.deep.equal({
    unique: GUID,
    culture: 'en-US',
    segment: undefined,
  });
});

it('reads a document route with no variant segment yet as the default variant', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}`)).to.deep.equal({
    unique: GUID,
    culture: undefined,
    segment: undefined,
  });
});

it('answers nothing for a route that is not a document being edited', () => {
  expect(previewTargetFromPath('/umbraco/section/content/dashboard')).to.equal(undefined);
  expect(previewTargetFromPath(`/umbraco/section/media/workspace/media/edit/${GUID}`)).to.equal(undefined);
});

it('answers nothing for a document being created, which has nothing saved to preview', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/create/parent/document/null/${GUID}`)).to.equal(
    undefined,
  );
});
