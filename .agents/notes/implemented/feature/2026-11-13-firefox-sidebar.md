# Agent Note: Firefox 侧栏

Status: implemented

## Problem

Chrome 版通过 Chrome 专有接口打开侧栏和启动后台脚本。用户要在桌面 Firefox 使用同一套纸页，并通过备份带走原有笔记。

## Decision

同一个 Vite 项目生成两个构建。Firefox 清单使用原生 sidebar_action 和模块后台脚本；Chrome 继续使用 side_panel 与 service worker。其余代码使用浏览器扩展接口的同一份适配，备份格式和存储键保持一致。Firefox 扩展 ID 固定为 today-paper@sparkchase，使后续商店版本可持续更新。

## Alternatives considered

单独维护 Firefox 分支会让备份格式和交互逐渐分歧；用普通标签页代替侧栏会让用户离开正在浏览的页面。双清单只分离浏览器的入口和兼容声明。

## Consequences

Chrome 和 Firefox 的笔记分别存在各自用户资料，迁移由用户导出并导入。审核需要 Firefox 构建包和可复现构建的源码包。Chrome 原有构建和发布路径可以继续使用。
