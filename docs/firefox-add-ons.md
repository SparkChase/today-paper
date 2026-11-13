# Firefox 版构建与审核

## 构建

使用 Node.js 22.12+ 和 npm 10。在源码包根目录执行：

```sh
npm ci
npm run build:firefox
```

结果位于 `dist-firefox/`。审核包是该目录的内容，`manifest.json` 在 ZIP 根目录。构建已在 macOS ARM64 的 Node.js 22.23.1 / npm 10.9.8 环境验证。

在桌面 Firefox 140+ 打开 `about:debugging#/runtime/this-firefox`，点击「临时载入附加组件」，选择 `dist-firefox/manifest.json`。在扩展菜单打开「今天这张纸」，也可以从 Firefox 的侧栏菜单选中它。临时扩展会在 Firefox 退出后移除，测试笔记可先导出备份。

## 商店资料

- 名称：今天这张纸
- 摘要：一张住在 Firefox 侧栏里的手绘便签。写随手记、存待看链接、贴图片、勾掉待办，或者把今天做成一张分享图。
- 说明：每一天都是新的一页。可以创建自己的分区，回看旧纸页，也能把未完成的事项抄到今天。备份包含文字、图片与勾选状态，支持从 Chrome 版导出的文件。数据保存在当前浏览器中，支持离线使用。
- 平台：仅桌面 Firefox。
- 主页：[GitHub](https://github.com/SparkChase/today-paper)
- 隐私说明：[privacy.md](privacy.md)

## Notes for Mozilla reviewers

Build from the root of the submitted source archive using Node.js 22.23.1 and npm 10.9.8:

```sh
npm ci
npm run build:firefox
```

The build output is `dist-firefox/`. No credentials, backend, or network connection are needed to use the extension. Open the sidebar via the toolbar action or choose “今天这张纸” in Firefox's sidebar menu. Create a task with “加一件要做的事”, enter text or paste a PNG, and click “记下”. “备份与导入” exports or restores local data; “分享这页” renders a PNG on the device.

`storage` persists notes and settings; `unlimitedStorage` accommodates multiple days of pasted image attachments. All processing is local, and the manifest declares no data collection. The lint findings about `innerHTML` come from the bundled React DOM runtime and Looseleaf's static SVG ink definitions in `vendor/looseleaf/lib/ink/react/defs.tsx`. Notes are rendered as React text, and pasted images are decoded and re-encoded locally.
