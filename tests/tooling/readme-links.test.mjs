import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const filename of ['README.md', 'README.en.md']) {
  test(`${filename} uses explicit links for local deployment addresses`, async () => {
    const markdown = await readFile(
      new URL(`../../${filename}`, import.meta.url),
      'utf8',
    );
    for (const port of [3000, 8080]) {
      const url = `http://127.0.0.1:${port}`;
      assert.ok(markdown.includes(`**[${url}](${url})**`));
      assert.ok(!markdown.includes(`**${url}**`));
    }
  });
}
