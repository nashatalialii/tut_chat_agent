import assert from 'node:assert/strict';
import test from 'node:test';
import { meanReciprocalRank, recallAtK } from '../src/eval/metrics.js';

const cases = [
  { expectedId: 'a', retrievedIds: ['a', 'b'] },
  { expectedId: 'b', retrievedIds: ['a', 'b'] },
  { expectedId: 'z', retrievedIds: ['a', 'b'] }
];

test('retrieval metrics are calculated deterministically', () => {
  assert.equal(recallAtK(cases, 1), 1 / 3);
  assert.equal(recallAtK(cases, 2), 2 / 3);
  assert.equal(meanReciprocalRank(cases), 0.5);
});
