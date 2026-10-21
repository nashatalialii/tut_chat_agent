import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { env } from '../src/env.js';

test('every legal record has universal retrieval profile metadata and content', async () => {
  const dir = path.resolve(env.DATA_DIR, 'legal');
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.meta.json'));
  assert.ok(names.length >= 100);

  for (const name of names) {
    const meta = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as Record<string, unknown>;
    const mdName = name.replace(/\.meta\.json$/u, '.md');
    const content = await fs.readFile(path.join(dir, mdName), 'utf8');
    assert.equal(meta.retrievalProfileVersion, 'universal-query-v8', `${name} missing v8 profile`);
    assert.match(content, /## بصمة الاسترجاع الموحدة/u, `${mdName} missing retrieval profile section`);
    assert.match(content, /\*\*كلمات الاسترجاع:\*\*/u, `${mdName} missing retrieval keywords`);
    assert.match(content, /### صيغ مطابقة موسعة/u, `${mdName} missing expanded variants`);
  }
});
