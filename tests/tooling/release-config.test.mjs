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

test('all workflows use Node 24 and pinned Node 24-compatible Actions', async () => {
  const actions = new Map([
    ['checkout', 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09'],
    ['setup-node', 'a0853c24544627f65ddf259abe73b1d18a591444'],
    ['upload-artifact', 'b7c566a772e6b6bfb58ed0dc250532a479d7789f'],
    ['configure-pages', '45bfe0192ca1faeb007ade9deae92b16b8254a0d'],
    ['upload-pages-artifact', 'fc324d3547104276b827a68afc52ff2a11cc49c9'],
    ['deploy-pages', '368f82528645a54fb793d4d04e342629a3f51346'],
  ]);
  for (const name of ['quality', 'extension', 'release', 'pages']) {
    const workflow = await readFile(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
      'utf8',
    );
    const versions = [...workflow.matchAll(/node-version:\s*'([^']+)'/g)];
    assert.ok(versions.length > 0, `${name}: missing Node version`);
    for (const [, version] of versions) assert.equal(version, '24', name);
    for (const [, action, sha] of workflow.matchAll(
      /uses: actions\/([\w-]+)@([a-f0-9]+)/g,
    )) {
      assert.equal(sha, actions.get(action), `${name}: ${action}`);
    }
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
