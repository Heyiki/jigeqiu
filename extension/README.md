# 记个球浏览器扩展

本文仅说明扩展的构建、打包、安装启动和测试。

## 构建与打包

在项目根目录安装依赖：

```sh
npm ci
```

本地开发与安装：

```sh
npm run build:extension
```

输出到根目录 `dist-extension/`。构建时从根目录 `package.json` 读取版本，
从 `public/favicon.ico` 提取 16、32、48、128px PNG 图标，并复制公共资源和许可证。
不需要手动同步版本或维护另一套图标源文件。

准备分发：

```sh
npm run package:extension
```

此命令先重新构建，再检查清单、入口、本地脚本、样式资源与图标，最后生成：

```text
release-extension/
├── jigeqiu-extension-<version>.zip
└── SHA256SUMS.txt
```

ZIP 根目录直接包含 `manifest.json`，没有多余的 `dist-extension/` 外层目录。
打包不依赖系统 `zip` 命令。ZIP 可用于商店提交，但构建成功不等于商店审核通过。
发送给其他人本地试用时，对方需要先解压，再加载解压后的目录。

原 `npm run build` 仍构建网页版，输出到 `dist/`。两套构建互不覆盖。

## GitHub Actions 打包

工作流 `.github/workflows/extension.yml` 在推送到 `master`、推送 `v*` 标签，
或通过 Actions 页面手动运行时执行扩展测试、构建、打包和 SHA256 校验。

进入仓库 **Actions → Package Browser Extension → 对应运行记录 → Artifacts**，
下载 `jigeqiu-extension-<commit SHA>`。解压下载的 Artifact 后，可找到扩展 ZIP
和 `SHA256SUMS.txt`。本地安装时再解压其中的扩展 ZIP，选择直接包含
`manifest.json` 的目录。Artifact 保留 30 天，不会自动创建或修改 GitHub Release，
也不会发布到 Chrome / Edge 商店。

## 本地安装

### Chrome

1. 在地址栏输入 `chrome://extensions`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择项目根目录下的 `dist-extension/`。
4. 打开新标签页；若浏览器询问是否保留新标签页更改，确认保留。

### Edge

1. 在地址栏输入 `edge://extensions`。
2. 开启开发人员模式。
3. 点击“加载解压缩的扩展”，选择同一个 `dist-extension/`。
4. 打开新标签页，并在浏览器提示时确认启用扩展或保留更改。

修改代码后重新构建，在扩展管理页点击重新加载，再刷新新标签页。
无需卸载重装；卸载可能导致扩展数据丢失。保持加载目录不变。
若另有扩展替换新标签页，需要处理两者的冲突。

## 测试

```sh
npm run test:extension
```

浏览器冒烟测试沿用项目现有的外部 Playwright 运行方式：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser:extension
```

Windows PowerShell 示例：

```powershell
$env:PLAYWRIGHT_MODULE = 'file:///C:/path/to/playwright/index.mjs'
npm run test:browser:extension
```

外部 Playwright 版本与已安装浏览器不一致时，可以额外设置
`PLAYWRIGHT_EXECUTABLE_PATH` 指向兼容的 Chromium 可执行文件。
测试使用独立的临时用户配置，不读取日常浏览器书签或配置。
覆盖新标签页加载、Web Locks、收藏保存与刷新、多标签页共享存储、
原有图标请求、候选选择、手动图片、资源加载、Hash 路由和 CSP；
使用受控图片响应检查原有图标逻辑，确认不再使用扩展原生图标接口。
截图输出到 `test-results/extension/`。
此自动测试使用 Chromium，不代替 Chrome / Edge 正式版本的手动验收或商店审核。
