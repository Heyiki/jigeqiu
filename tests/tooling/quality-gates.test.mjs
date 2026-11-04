import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

test('ESLint rejects undefined names and accepts browser evaluation globals', async () => {
  const [invalid] = await eslint.lintText('missingQualityGateName();', {
    filePath: 'tests/browser/quality-gate-probe.mjs',
  });
  assert.ok(invalid.messages.some((message) => message.ruleId === 'no-undef'));
  const [valid] = await eslint.lintText(
    'document.querySelector("button"); process.cwd();',
    { filePath: 'tests/browser/quality-gate-probe.mjs' },
  );
  assert.equal(valid.errorCount, 0);
});

test('both tooling and browser runners reject unused variables', async () => {
  const [tooling] = await eslint.lintText('const unusedQualityGate = 1;', {
    filePath: 'tests/tooling/quality-gate-probe.mjs',
  });
  assert.ok(
    tooling.messages.some((message) => message.ruleId === 'no-unused-vars'),
  );
  const [browser] = await eslint.lintText('const unusedQualityGate = 1;', {
    filePath: 'tests/browser/quality-gate-probe.mjs',
  });
  assert.ok(
    browser.messages.some((message) => message.ruleId === 'no-unused-vars'),
  );
});

test('ESLint ignores generated output and does not pretend to parse TypeScript', async () => {
  assert.equal(await eslint.isPathIgnored('dist/assets/generated.js'), true);
  assert.equal(await eslint.isPathIgnored('src/PrototypeApp.tsx'), true);
});

test('format policy detects bad formatting and accepts its formatted result', async () => {
  const filepath = new URL('../../.prettierrc.json', import.meta.url);
  const options = await prettier.resolveConfig(fileURLToPath(filepath));
  assert.ok(options);
  const input = 'const result={one:1,two:2}';
  const settings = { ...options, parser: 'babel' };
  assert.equal(await prettier.check(input, settings), false);
  const formatted = await prettier.format(input, settings);
  assert.equal(await prettier.check(formatted, settings), true);
});

test('aggregate check includes independent lint, types, format and tooling tests', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  for (const script of [
    'test',
    'test:tooling',
    'test:contracts',
    'lint',
    'typecheck',
    'format:check',
    'build',
  ]) {
    assert.ok(manifest.scripts.check.includes(`npm run ${script}`), script);
  }
  assert.equal(manifest.scripts.typecheck, 'tsc --noEmit');
  assert.match(manifest.scripts.lint, /eslint/);
  assert.doesNotMatch(manifest.scripts['format:check'], /--write/);
});
