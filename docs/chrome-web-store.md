# Chrome 网上应用店提审资料

## 提交顺序

1. 用发布者的 Google 账号登录 [Chrome 开发者后台](https://chrome.google.com/webstore/devconsole)。首次注册时需缴纳一次性费用，金额以后台显示为准。
2. 选择添加新项目，上传商店版 ZIP。商店包的 `manifest.json` 位于压缩包根目录。
3. 填写商店资料，使用 ZIP 内的 `icons/128.png` 作为图标。上传 1280 × 800 的实际侧栏截图。
4. 填写隐私声明及权限用途，选择公开分发并提交审核。后续向同一项目上传版本号更高的 ZIP。审核并发布后，Chrome 会自动更新商店安装的扩展。

官方说明见 [注册开发者](https://developer.chrome.com/docs/webstore/register)、[发布扩展](https://developer.chrome.com/docs/webstore/publish)及[填写隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)。

## 商品介绍

- **名称**　今天这张纸
- **语言**　简体中文
- **简介**　在 Chrome 侧栏随手记下想法、图片和待办。每天一页，完成时盖个「收工」章。

**详细介绍**

打开 Chrome 侧栏，就有一张今天的手绘便签。写几句感想、贴一张截图、存下待看的链接，或勾掉刚做完的事。页面按日期保存，也可以添加自己的记录区。

点击日期翻阅历史。从「备份与导入」带走整本记录，包含图片与勾选状态。只想分享一天时，可以选中几个分区，预览后复制或下载带日期和手绘印章的 PNG。

笔记、图片和备份操作均在本机处理。

**隐私说明**

[https://github.com/SparkChase/today-paper/blob/main/docs/privacy.md](https://github.com/SparkChase/today-paper/blob/main/docs/privacy.md)

## 隐私和权限字段

- 单一用途是在 Chrome 侧栏编写、保存和整理个人便签。导入、导出和分享服务于这些便签。
- `sidePanel` 用来在 Chrome 侧栏显示便签。
- `storage` 用来在当前 Chrome 用户资料保存记录、分区、图片与完成状态。
- `unlimitedStorage` 让多日的本地图片记录可以超出普通扩展的存储配额。
- 代码和字体均随扩展打包。扩展不执行远程代码，也不向开发者发送笔记或图片。
