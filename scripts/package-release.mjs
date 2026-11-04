import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const tag = process.argv[2];
assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/, 'Expected a lowercase v-prefixed release version');
assert.equal(tag, `v${version}`, 'Tag must match package.json version');
for (const file of ['dist/index.html', 'dist/wallpapers/CREDITS.md', 'LICENSE']) {
  assert.ok((await stat(path.join(root, file))).isFile(), `Missing release file: ${file}`);
}
const staging = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-release-'));
try {
  await cp(path.join(root, 'dist'), staging, { recursive: true });
  await cp(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'));
  const output = path.join(root, 'release-assets');
  await mkdir(output, { recursive: true });
  const name = `jigeqiu-${tag}-web.zip`;
  const temporaryArchive = path.join(staging, '..', `${path.basename(staging)}.zip`);
  try {
    execFileSync('zip', ['-q', '-r', temporaryArchive, '.'], { cwd: staging });
    const bytes = await readFile(temporaryArchive);
    await writeFile(path.join(output, name), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(output, 'SHA256SUMS.txt'), `${hash}  ${name}\n`);
  } finally {
    await rm(temporaryArchive, { force: true });
  }
  console.log(`Release package created: release-assets/${name}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
