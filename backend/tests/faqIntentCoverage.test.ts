import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { env } from '../src/env.js';
import { matchFaqIntent } from '../src/rag/faqIntentIndex.js';

type FaqRow = {
  faq_id: string;
  references: string[];
  variants?: string[];
};

test('all canonical FAQ variants resolve to one of their declared legal references', async () => {
  const target = path.resolve(env.DATA_DIR, 'faq', 'faq_canonical_88.jsonl');
  const rows = (await fs.readFile(target, 'utf8'))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FaqRow);

  let checked = 0;
  for (const row of rows) {
    for (const variant of row.variants ?? []) {
      const match = await matchFaqIntent(variant);
      assert.ok(match, `No FAQ match for ${row.faq_id}: ${variant}`);
      assert.ok(
        match.references.some((reference) => row.references.includes(reference)),
        `Wrong FAQ reference for ${row.faq_id}: ${variant} -> ${match.references.join(', ')}`
      );
      checked += 1;
    }
  }
  assert.equal(checked, 352);
});
