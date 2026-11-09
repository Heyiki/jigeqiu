# 记个球浏览器扩展

第一版是 Chrome / Edge 共用的 Manifest V3 新标签页扩展。
直接打包现有应用，不需要 Node.js 服务、账号或业务后端。

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

## 隐私告知

首次使用先显示隐私告知，点击“知晓并继续”并成功保存本地告知记录后才加载工作台。
选择“暂不使用”不会进入工作台，可关闭页面或在浏览器中停用扩展。
告知确认不是浏览器权限授权，不会新增权限。

可通过工作台左下角的盾牌图标随时打开完整隐私说明；说明随扩展打包，可离线查看。
告知版本变化或本地确认记录被清除后会再次提示。手动图片链接旁也会提示联网风险。
隐私说明涵盖本地数据、新标签页替换、网站图标及第三方网络请求和数据导出删除。
正式发布到商店时仍需按商店要求提供可公开访问的隐私政策地址及相符的数据披露。

## 功能与限制

- 使用独立入口 `extension/main.tsx`，直接挂载现有 `src/App.tsx`。
- 不修改 `src/`、`public/`、网页入口或网页版 Vite 配置。
- 扩展样式入口显式扫描共享 `src/`，避免遗漏 Tailwind 工具类。
- 使用系统字体，不加载网页版 HTML 中的 Google Fonts。
- 不申请浏览器书签、标签页或所有网站访问权限。
- 网站图标沿用网页版的获取、缓存和回退逻辑，不申请 `favicon` 权限。
- 不自动读取、修改或同步浏览器原生书签，继续使用 HTML / JSON 文件导入导出。
- 不包含后台 Service Worker、内容脚本、工具栏弹窗或自动更新服务。
- 保留原图标选择器的在线候选、自动推荐、文字图标及手动图片链接。
- 图标和手动图片请求仍受跨域、防盗链、认证及网络限制，无法保证所有网站加载成功。
- 外部网站的 iframe 限制仍然存在，不会通过扩展绕过网站安全策略。

### 图标与权限

扩展复用原网站图标服务和选择器，只在图片选择器旁增加隐私提示。
自动获取可能请求网站 favicon、常见图标路径、首页 HTML 以及声明的
manifest、图标或 Logo。自定义搜索引擎沿用相同逻辑，无需预置域名列表。

保留原图标缓存设置和 Google 图标服务开关；Google 服务默认关闭，
启用后会向该服务发送网站域名。清除应用图标缓存后可能重新联网获取。

未增加 `host_permissions`、后台代理或全局 `fetch` 改写，不绕过网站的 CORS 策略。
图标和远程图片可能联网，因此扩展并非完全离线。

## 本地数据

收藏、偏好、图标缓存和自定义壁纸仍使用现有浏览器本地存储。
网页版、扩展版、Chrome 和 Edge 的数据各自独立，不会自动迁移或云同步。
网页数据需要通过现有导入导出功能迁移。

继续使用原管理中心的 HTML / JSON 导入导出，不额外提供扩展专用备份页面。
JSON 导出只包含收藏资产，不包含设置、布局、回收站或自定义壁纸。
正常更新请重新构建并加载或使用原商店条目更新，不要卸载重装。

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
