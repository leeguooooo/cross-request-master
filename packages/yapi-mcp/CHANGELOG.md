# Changelog

## 0.6.1 - 2026-05-15

### Bug Fixes
- **HTML 上传不再污染 YApi 全局样式**：HTML 文档现在通过 `<iframe srcdoc sandbox="allow-same-origin">` 包装后写入 `desc`，HTML 内的全局 `<style>` 选择器和裸 `<h1>/<body>` 字号不会再逃逸出来影响 YApi 页面 chrome。iframe 高度固定 `1500px`，超出部分内部滚动。iframe **不开启** `allow-scripts`，HTML 里的 `<script>` 不会执行。
- 升级路径：0.6.0 升 0.6.1 后跑一次 `yapi docs-sync --force` 强制覆盖已被污染的文档。

## 0.6.0 - 2026-05-14

### Features
- `docs-sync` 支持 `.html` 源文件：HTML 跳过渲染管线，原样上传 `desc`；`markdown` 字段填写警告横幅 + HTML 源码围栏，明示 "请勿在 YApi 网页编辑"。
- 同名 `.md` / `.html` 共存时优先采用 `.html` 并 warn。
- watch 模式同步监听 `.html` 文件变更。

### Compatibility
- 现有纯 markdown 流程行为不变：`buildDocsSyncHash` 对 markdown kind 走兼容路径，hash 值与 0.5.x 完全一致，升级后第一次 sync 不会触发不必要的重 push。
