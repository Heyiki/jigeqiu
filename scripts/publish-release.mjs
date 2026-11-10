import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checksumName = 'SHA256SUMS.txt';

function checksums(text, allowed) {
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9.-]+)$/.exec(line);
    assert.ok(match && allowed.includes(match[2]), 'Unexpected checksum entry');
    assert.ok(!result.has(match[2]), 'Duplicate checksum entry');
    result.set(match[2], match[1]);
  }
  return result;
}

export async function prepareReleaseAssets(root, tag) {
  const { version } = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  assert.match(
    tag ?? '',
    /^v\d+\.\d+\.\d+$/,
    'Expected a v-prefixed release version',
  );
  assert.equal(tag, `v${version}`, 'Tag must match package.json version');
  const names = [`jigeqiu-${tag}-web.zip`, `jigeqiu-extension-${version}.zip`];
  const output = path.join(root, 'release-assets');
  const assets = [];
  for (const [index, name] of names.entries()) {
    const folder = index === 0 ? output : path.join(root, 'release-extension');
    const bytes = await readFile(path.join(folder, name));
    const sums = checksums(
      await readFile(path.join(folder, checksumName), 'utf8'),
      names,
    );
    assert.equal(sums.get(name), sha256(bytes), `Checksum mismatch: ${name}`);
    assets.push({ name, path: path.join(output, name), hash: sha256(bytes) });
  }
  await copyFile(
    path.join(root, 'release-extension', names[1]),
    assets[1].path,
  );
  const combined = assets
    .map(({ name, hash }) => `${hash}  ${name}\n`)
    .join('');
  await writeFile(path.join(output, checksumName), combined);
  return [
    ...assets,
    {
      name: checksumName,
      path: path.join(output, checksumName),
      hash: sha256(combined),
    },
  ];
}

async function gh(args) {
  const { stdout } = await execute('gh', args, {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function verifyRemote(run, api, release, expected) {
  const pages = JSON.parse(
    await run([
      'api',
      `${api}/releases/${release.id}/assets`,
      '--paginate',
      '--slurp',
    ]),
  );
  const assets = pages.flat();
  const downloaded = new Map();
  for (const { name } of expected) {
    const matches = assets.filter((asset) => asset.name === name);
    assert.equal(
      matches.length,
      1,
      `Missing or duplicate release asset: ${name}`,
    );
    const [asset] = matches;
    assert.equal(asset.state, 'uploaded', `Incomplete release asset: ${name}`);
    const bytes = Buffer.from(
      await run([
        'api',
        `${api}/releases/assets/${asset.id}`,
        '-H',
        'Accept: application/octet-stream',
      ]),
    );
    assert.equal(
      bytes.length,
      asset.size,
      `Release asset size mismatch: ${name}`,
    );
    downloaded.set(name, bytes);
  }
  const sums = checksums(
    downloaded.get(checksumName).toString('utf8'),
    expected.slice(0, 2).map(({ name }) => name),
  );
  assert.equal(sums.size, 2, 'Release checksum must cover both packages');
  for (const asset of expected.slice(0, 2)) {
    const actual = sha256(downloaded.get(asset.name));
    assert.equal(
      actual,
      sums.get(asset.name),
      `Remote checksum mismatch: ${asset.name}`,
    );
  }
  // Rebuilds can differ in ZIP timestamps. Published versions are immutable and
  // verified against their own manifest; drafts must match this exact build.
  if (release.draft) {
    for (const asset of expected) {
      assert.equal(
        sha256(downloaded.get(asset.name)),
        asset.hash,
        `Upload mismatch: ${asset.name}`,
      );
    }
  }
}

export async function publishRelease({ root, tag, repo, run = gh }) {
  const assets = await prepareReleaseAssets(root, tag);
  assert.match(repo ?? '', /^[\w.-]+\/[\w.-]+$/, 'Expected owner/repository');
  const api = `repos/${repo}`;
  await run(['api', `${api}/git/ref/tags/${encodeURIComponent(tag)}`]);
  const pages = JSON.parse(
    await run(['api', `${api}/releases?per_page=100`, '--paginate', '--slurp']),
  );
  const matches = pages.flat().filter((release) => release.tag_name === tag);
  assert.ok(
    matches.length <= 1,
    `Multiple releases for ${tag}; resolve duplicates manually before publishing`,
  );
  let release = matches[0];
  if (!release) {
    release = JSON.parse(
      await run([
        'api',
        `${api}/releases`,
        '--method',
        'POST',
        '-f',
        `tag_name=${tag}`,
        '-f',
        `name=JIGEQIU ${tag}`,
        '-F',
        'draft=true',
        '-f',
        'body=Web: extract the web ZIP into your web root. Chrome / Edge: extract the extension ZIP, enable developer mode and load the unpacked folder containing manifest.json. Verify both ZIPs with SHA256SUMS.txt.',
      ]),
    );
    assert.equal(release.tag_name, tag);
    assert.equal(release.draft, true);
  }
  if (release.draft) {
    const current = JSON.parse(
      await run(['api', `${api}/releases/${release.id}`]),
    );
    assert.equal(current.draft, true, 'Release is no longer a draft');
    assert.equal(current.tag_name, tag, 'Release tag changed');
    const existing = JSON.parse(
      await run([
        'api',
        `${api}/releases/${release.id}/assets`,
        '--paginate',
        '--slurp',
      ]),
    ).flat();
    if (
      assets.every(({ name }) => existing.some((asset) => asset.name === name))
    ) {
      await verifyRemote(run, api, { ...release, draft: false }, assets);
    } else {
      const missing = [];
      for (const asset of assets) {
        const matches = existing.filter(({ name }) => name === asset.name);
        assert.ok(matches.length <= 1, `Duplicate draft asset: ${asset.name}`);
        if (!matches.length) {
          missing.push(asset);
          continue;
        }
        const bytes = await run([
          'api',
          `${api}/releases/assets/${matches[0].id}`,
          '-H',
          'Accept: application/octet-stream',
        ]);
        assert.equal(
          sha256(bytes),
          asset.hash,
          `Draft asset differs; resolve manually: ${asset.name}`,
        );
      }
      for (const asset of missing) {
        const current = JSON.parse(
          await run(['api', `${api}/releases/${release.id}`]),
        );
        assert.equal(current.draft, true, 'Release is no longer a draft');
        assert.equal(current.tag_name, tag, 'Release tag changed');
        await run([
          'api',
          `https://uploads.github.com/${api}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`,
          '--method',
          'POST',
          '--input',
          asset.path,
          '-H',
          `Content-Type: ${asset.name.endsWith('.zip') ? 'application/zip' : 'text/plain'}`,
        ]);
      }
      await verifyRemote(run, api, release, assets);
    }
  } else {
    await verifyRemote(run, api, release, assets);
  }
  if (release.draft) {
    const current = JSON.parse(
      await run(['api', `${api}/releases/${release.id}`]),
    );
    assert.equal(current.draft, true, 'Release is no longer a draft');
    assert.equal(current.tag_name, tag, 'Release tag changed');
    const published = JSON.parse(
      await run([
        'api',
        `${api}/releases/${release.id}`,
        '--method',
        'PATCH',
        '-F',
        'draft=false',
      ]),
    );
    assert.equal(published.draft, false, 'Release was not published');
    assert.equal(published.tag_name, tag);
  }
  console.log(`Release verified: ${repo} ${tag}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [tag, mode] = process.argv.slice(2);
  assert.ok(
    mode === undefined || mode === '--publish',
    'Unexpected release option',
  );
  if (mode === '--publish') {
    await publishRelease({
      root: process.cwd(),
      tag,
      repo: process.env.GH_REPO,
    });
  } else {
    await prepareReleaseAssets(process.cwd(), tag);
    console.log('Both release packages and combined checksums are ready');
  }
}
