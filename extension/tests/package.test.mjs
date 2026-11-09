import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-extension-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['assets', 'icons', 'wallpapers']) {
    await mkdir(path.join(root, directory));
  }
  const manifest = {
    manifest_version: 3,
    name: 'JIGEQIU',
    version: '0.1.0',
    chrome_url_overrides: { newtab: 'index.html' },
    icons: { 128: 'icons/icon-128.png' },
  };
  for (const [name, content] of Object.entries({
    'manifest.json': JSON.stringify(manifest),
    'index.html':
      '<html><head><link rel="stylesheet" href="/assets/app.css"></head><body><script type="module" src="/assets/app.js"></script></body></html>',
    'assets/app.js': 'console.log("fixture");',
    'assets/app.css': 'body { background: url("/wallpapers/test.webp"); }',
    'icons/icon-128.png': 'icon fixture',
    'wallpapers/test.webp': 'wallpaper fixture',
    'wallpapers/CREDITS.md': 'Wallpaper attribution',
    LICENSE: 'MIT license fixture',
  })) {
    await writeFile(path.join(root, name), content);
  }
  return root;
}

test('validates a self-contained extension with root-relative local assets', async (t) => {
  const root = await fixture(t);
  const { validateExtension } = await import('../scripts/package.mjs');
  const manifest = await validateExtension(root, '0.1.0');
  assert.equal(manifest.chrome_url_overrides.newtab, 'index.html');
});

test('rejects missing entry, icon, stylesheet and wallpaper resources', async (t) => {
  const { validateExtension } = await import('../scripts/package.mjs');
  for (const file of [
    'index.html',
    'icons/icon-128.png',
    'assets/app.css',
    'wallpapers/test.webp',
  ]) {
    const root = await fixture(t);
    await rm(path.join(root, file));
    await assert.rejects(
      validateExtension(root, '0.1.0'),
      /Missing extension file/,
    );
  }
});

test('rejects mismatched versions and paths escaping the extension', async (t) => {
  const root = await fixture(t);
  const { validateExtension } = await import('../scripts/package.mjs');
  await assert.rejects(validateExtension(root, '0.2.0'), /version/i);
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.chrome_url_overrides.newtab = '../outside.html';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    validateExtension(root, '0.1.0'),
    /Unsafe extension path/,
  );
});

test('rejects remote scripts and inline executable scripts', async (t) => {
  const { validateExtension } = await import('../scripts/package.mjs');
  for (const script of [
    '<script src="https://example.com/app.js"></script>',
    '<script>alert(1)</script>',
  ]) {
    const root = await fixture(t);
    await writeFile(path.join(root, 'index.html'), script);
    await assert.rejects(validateExtension(root, '0.1.0'), /script/i);
  }
});

test('packages root-level extension files and matching SHA256 checksum', async (t) => {
  const root = await fixture(t);
  const output = await mkdtemp(
    path.join(os.tmpdir(), 'jigeqiu-extension-zip-'),
  );
  t.after(() => rm(output, { recursive: true, force: true }));
  const { packageExtension } = await import('../scripts/package.mjs');
  const { unzipSync, strFromU8 } = await import('fflate');
  const archive = await packageExtension(root, output, '0.1.0');
  const bytes = await readFile(archive);
  const entries = unzipSync(bytes);
  assert.equal(
    JSON.parse(strFromU8(entries['manifest.json'])).version,
    '0.1.0',
  );
  for (const name of [
    'index.html',
    'assets/app.js',
    'icons/icon-128.png',
    'LICENSE',
    'wallpapers/CREDITS.md',
  ]) {
    assert.ok(entries[name], name);
  }
  assert.ok(
    Object.keys(entries).every((name) => !name.startsWith('dist-extension/')),
  );
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    await readFile(path.join(output, 'SHA256SUMS.txt'), 'utf8'),
    `${hash}  jigeqiu-extension-0.1.0.zip\n`,
  );
});
