import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
const lock = JSON.parse(
  await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
);

test('npm start uses the same TypeScript runner as the documented dev command', () => {
  assert.equal(manifest.scripts.dev, 'tsx server.ts');
  assert.equal(manifest.scripts.start, manifest.scripts.dev);
});

test('release metadata names the project and stays consistent with the lockfile', () => {
  assert.equal(manifest.name, 'jigeqiu-web');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.notEqual(manifest.version, '0.0.0');
  for (const entry of [lock, lock.packages['']]) {
    assert.equal(entry.name, manifest.name);
    assert.equal(entry.version, manifest.version);
  }
});

test('locked package tarballs use the official HTTPS npm registry', () => {
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!entry.resolved) continue;
    assert.equal(
      new URL(entry.resolved).origin,
      'https://registry.npmjs.org',
      name,
    );
  }
});

test('tag release workflow owns both packages and publishes only after preparation', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /tags:\s+- 'v\*'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run package:extension/);
  const prepare = workflow.indexOf(
    'node scripts/publish-release.mjs "$RELEASE_TAG"',
  );
  const verify = workflow.indexOf('sha256sum --check SHA256SUMS.txt');
  const publish = workflow.indexOf(
    'node scripts/publish-release.mjs "$RELEASE_TAG" --publish',
  );
  assert.ok(prepare >= 0 && verify > prepare && publish > verify);
  assert.doesNotMatch(workflow, /gh release create/);
  const extensionWorkflow = await readFile(
    new URL('../../.github/workflows/extension.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(extensionWorkflow, /tags:/);
  assert.match(extensionWorkflow, /branches: \[master\]/);
  assert.match(extensionWorkflow, /workflow_dispatch:/);
});
