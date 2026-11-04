import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(
  new URL('../../scripts/package-release.mjs', import.meta.url),
);

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dist/wallpapers'), { recursive: true });
  await mkdir(path.join(root, 'dist/assets'), { recursive: true });
  for (const [name, content] of Object.entries({
    'package.json': '{"version":"0.1.0"}',
    LICENSE: 'MIT license fixture',
    'dist/index.html': '<html>fixture</html>',
    'dist/assets/app.js': 'console.log("fixture")',
    'dist/wallpapers/CREDITS.md': 'Wallpaper attribution fixture',
  })) {
    await writeFile(path.join(root, name), content);
  }
  return root;
}

test('release archive contains site-root files, licensing and a matching checksum', async (t) => {
  const root = await fixture(t);
  execFileSync(process.execPath, [script, 'v0.1.0'], { cwd: root });
  const archive = path.join(root, 'release-assets/jigeqiu-v0.1.0-web.zip');
  const names = execFileSync('unzip', ['-Z1', archive], {
    encoding: 'utf8',
  }).split('\n');
  for (const name of [
    'index.html',
    'assets/app.js',
    'LICENSE',
    'wallpapers/CREDITS.md',
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(names.every((name) => !name.startsWith('dist/')));
  const hash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  assert.equal(
    await readFile(path.join(root, 'release-assets/SHA256SUMS.txt'), 'utf8'),
    `${hash}  jigeqiu-v0.1.0-web.zip\n`,
  );
});

test('release packaging rejects mismatched tags before creating assets', async (t) => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [script, 'v0.2.0'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version/);
});
