import assert from 'node:assert/strict';
import test from 'node:test';
import { isApplicableOn } from '../src/rag/versioning.js';
import type { LegalMetadata } from '../src/rag/types.js';

const base: LegalMetadata = {
  documentId: 'd', documentTitle: 'doc', documentType: 'law', jurisdiction: 'Egypt', sourceName: 'source',
  language: 'ar', contentHash: 'hash', sourceStatus: 'verified', originalFilename: 'doc.txt'
};

test('version applicability respects known effective dates without inventing missing dates', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');
  assert.equal(isApplicableOn({ ...base, effectiveFrom: '2025-01-01' }, asOf), true);
  assert.equal(isApplicableOn({ ...base, effectiveTo: '2025-12-31' }, asOf), false);
  assert.equal(isApplicableOn(base, asOf), true);
});
