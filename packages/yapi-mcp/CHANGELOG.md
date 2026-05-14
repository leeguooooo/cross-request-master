# Changelog

## 0.6.0 - 2026-05-14

### Features
- `docs-sync` 支持 `.html` 源文件：HTML 跳过渲染管线，原样上传 `desc`；`markdown` 字段填写警告横幅 + HTML 源码围栏，明示 "请勿在 YApi 网页编辑"。
- 同名 `.md` / `.html` 共存时优先采用 `.html` 并 warn。
- watch 模式同步监听 `.html` 文件变更。

### Compatibility
- 现有纯 markdown 流程行为不变：`buildDocsSyncHash` 对 markdown kind 走兼容路径，hash 值与 0.5.x 完全一致，升级后第一次 sync 不会触发不必要的重 push。
