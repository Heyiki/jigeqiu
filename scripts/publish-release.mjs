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
        `body=## 中文

**记个球 JIGEQIU** 是一款轻量的个人网址收藏工作台，提供收藏管理、桌面快捷方式、启动台和搜索，支持中英文界面。数据保存在当前浏览器，不依赖账号或云同步。你可以将它安装为浏览器新标签页扩展，也可以自行部署网页版，请按用途选择下方 **Release Assets** 中的文件。

| 文件 | 适用场景 | 使用方式 |
| --- | --- | --- |
| \`${assets[1].name}\` | Chrome / Edge 新标签页扩展 | 下载这个文件，按下方步骤安装 |
| \`${assets[0].name}\` | 自行部署 Web 网页版 | 解压后将文件部署到静态网站服务器，建议使用 HTTPS；无需 Node.js 运行环境 |
| \`SHA256SUMS.txt\` | 校验下载文件完整性 | 用于核对上述两个 ZIP 的 SHA256 |
| \`Source code (zip / tar.gz)\` | 开发与源码研究 | GitHub 自动生成的源码包，不是可直接安装的成品 |

### Chrome 安装

1. 下载上方的扩展 ZIP 文件，不用解压。
2. 在 Chrome 地址栏输入 \`chrome://extensions/\`，按回车。
3. 打开右上角的“开发者模式”，把下载的 ZIP 文件拖入这个页面。
4. 打开一个新标签页，就可以使用记个球了。

**Edge 安装或拖入后没有反应：** 先把 ZIP 解压到一个长期保留的文件夹。Chrome 打开 \`chrome://extensions/\`，Edge 打开 \`edge://extensions/\`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择里面有 \`manifest.json\` 的文件夹。安装后请保留这个文件夹。

### Web 网页版使用

Web 压缩包用于搭建自己的记个球网站。如果只想在浏览器里直接使用，选择上面的扩展版即可。

1. 下载 \`${assets[0].name}\`，解压后找到 \`index.html\`、\`assets\` 和 \`wallpapers\`。
2. 在你使用的网站托管平台中新建一个网站，把这些文件和文件夹一起上传到网站目录。没有托管平台时，可以请熟悉建站的朋友帮忙。
3. 为网站开启 HTTPS，再用浏览器打开平台提供的网址，就可以使用了。详细配置见下方完整使用说明。

不要直接双击 \`index.html\` 打开，也不用把 Web 压缩包拖到浏览器扩展页面。这个包已经做好了，不需要安装 Node.js 或运行编译命令。

更新网页版前先导出资产备份，再用新版压缩包中的全部文件替换网站旧文件。保持网站地址不变，用原来的浏览器打开；收藏保存在浏览器中，不会随网站文件一起上传。

### 更新与备份

更新前，打开记个球的“管理中心 → 导入与导出 → 资产备份恢复”，点击“导出资产备份”，保存好文件，不要先卸载扩展。通过文件夹安装的用户，把新版文件解压到原来的文件夹，替换旧文件，再到扩展管理页点击“重新加载”。通过 ZIP 拖入安装的用户，可以先备份，再按上方文件夹安装步骤加载新版，并在新版中恢复备份。

换浏览器或从网页版转到扩展版时，在新页面的“资产备份恢复”中选择备份文件，预览后确认恢复。两边的数据不会自动同步。

完整资产备份包含收藏、搜索引擎、桌面布局与任务栏；壁纸和外观需要重新设置。只想转移收藏时，选择“收藏导入导出”即可。

## English

**JIGEQIU** is a lightweight personal bookmark workbench featuring bookmark management, desktop shortcuts, a launchpad and search, with Chinese and English interfaces. Data stays in your current browser, with no account or cloud sync required. Install it as a new tab extension or host the web edition yourself. Choose the appropriate file from **Release Assets** below.

| File | Intended Use | Getting Started |
| --- | --- | --- |
| \`${assets[1].name}\` | Chrome / Edge new tab extension | Download this file and follow the steps below |
| \`${assets[0].name}\` | Self-hosted web edition | Extract and deploy the files to a static web server, preferably over HTTPS; no Node.js runtime is required |
| \`SHA256SUMS.txt\` | Download integrity verification | Verify the SHA256 checksums of the two ZIP files |
| \`Source code (zip / tar.gz)\` | Development and source inspection | Source archives generated by GitHub, not ready-to-install builds |

### Install in Chrome

1. Download the extension ZIP above. You do not need to extract it.
2. Type \`chrome://extensions/\` in Chrome's address bar and press Enter.
3. Turn on **Developer mode**, then drag the extension ZIP onto the page.
4. Open a new tab to start using JIGEQIU.

**Using Edge, or nothing happened?** Extract the ZIP to a folder you will keep. Open \`chrome://extensions/\` in Chrome or \`edge://extensions/\` in Edge, turn on **Developer mode**, click **Load unpacked** and select the folder containing \`manifest.json\`. Keep this folder after installation.

### Use the Web Edition

The Web ZIP lets you set up your own JIGEQIU website. If you just want to use JIGEQIU in your browser, choose the extension above.

1. Download \`${assets[0].name}\` and extract it. Find \`index.html\`, \`assets\` and \`wallpapers\`.
2. Create a website with your website hosting provider and upload these files and folders together to the website folder. If you do not have a hosting provider, ask someone familiar with setting up websites to help.
3. Enable HTTPS for the website, then open the address provided by your host. See the full guide below for detailed setup.

Do not open \`index.html\` by double-clicking it or drag the Web ZIP onto the extensions page. The package is ready to use; no Node.js installation or build commands are needed.

Before updating the website, export an asset backup, then replace the old website files with all the files from the new Web ZIP. Keep the same website address and use your original browser. Bookmarks stay in your browser; they are not uploaded with the website files.

### Updates and Backups

Before updating, open **Manage → Import & export → Backup & restore**, click **Export asset backup** and keep the file. Do not uninstall the extension first. If you installed from a folder, extract the new files into that same folder, replace the old files, then click **Reload** on the extensions page. If you installed by dropping a ZIP, you can back up first, install the new version using the folder steps above, then restore your backup in the new version.

When moving to another browser or from the web edition to the extension, select your backup in **Backup & restore** on the new page, review it and confirm the restore. The two editions do not sync automatically.

A full backup includes bookmarks, search engines, desktop layout and taskbar. Set up your wallpaper and appearance again afterward. To move only bookmarks, use **Bookmark transfer**.

完整使用说明 / Full guide: [中文 README](https://github.com/${repo}/blob/${tag}/README.md) · [English README](https://github.com/${repo}/blob/${tag}/README.en.md)
`,
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
