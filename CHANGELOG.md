# 更新日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [4.4.12] - 2025-10-17

### 修复

- 修复相对 URL 解析问题
  - 根相对路径（如 `/config/post_data`）现在正确解析为 `location.origin + path`
  - 其他相对路径（如 `api/endpoint`）使用 `new URL(path, location.href)` 解析
  - 添加错误处理，避免无效 URL 导致崩溃

- 修复 HTTP 方法大小写敏感问题（PR #17）
  - `background.js` 中的方法检查改为大小写不敏感
  - 避免混合大小写方法（如 `Get`、`hEaD`）导致 fetch 错误

### 致谢

- 感谢 @justopt796 提交 PR #17，修复了相对 URL 和方法大小写问题

## [4.4.11] - 2025-10-17

### 改进

- 收紧网站检测规则，减少误报风险
  - 移除单独的 `title.includes('api')` 判断（太宽泛）
  - 移除单独的 `url.includes('/api/')` 判断（太常见）
  - API 管理平台检测需要多个关键词组合
  - URL 检测需要路径和域名同时匹配

### 新增

- 新增手动启用选项
  - 用户可以在页面添加 `<meta name="cross-request-enabled">` 标记
  - 强制启用完整模式，适用于内部 API 管理系统

### 文档

- 添加详细的测试指南（TESTING.md）
- 优化 README 结构，提升专业性
- 创建独立的 CHANGELOG.md 文件

## [4.4.10] - 2025-10-17

### 修复

- 修复静默模式下 `window.crossRequest` 手动调用失败的问题
  - 静默模式现在仍然启用 DOM 监听，确保手动调用正常工作
  - 只关闭 UI 显示和调试日志，保持核心功能

- 修复 jQuery 拦截破坏 YApi 核心功能的问题
  - 智能模式：在 YApi 等目标网站默认拦截（可用 `crossRequest: false` 禁用）
  - 在其他网站改为 opt-in（需要 `crossRequest: true` 启用）
  - 保持向后兼容，YApi 无需修改代码

## [4.4.9] - 2025-10-17

### 修复

- 修复 Issue #15: jQuery 拦截导致其他网站请求失败
- 修复 GET/HEAD 请求错误添加 Content-Type 的问题
- 修复用户报告的 "GET/HEAD method cannot have body" 错误

### 改进

- jQuery 拦截逻辑优化，根据网站类型采用不同策略

### 致谢

- 感谢 @Rany-yilian 在 issue #15 中的详细反馈

## [4.4.8] - 2025-10-17

### 新增

- 智能网站检测机制，自动识别 YApi 等 API 管理平台
- 静默模式：在非目标网站上减少影响
  - 只注入 API，不启动完整监听
  - 关闭调试日志输出
  - 不显示 cURL 弹窗和错误提示

### 检测规则

- Meta 关键词包含 "yapi"、"api管理"、"接口管理"
- 页面标题包含 "yapi"、"接口测试"、"api"
- URL 包含 /interface/、/project/、/api/ 等常见路径

### 性能优化

- 减少 DOM 观察和事件监听对其他网站的影响
- 不再污染其他网站的控制台日志

## [4.4.7] - 2025-10-17

### 修复

- 修复严重 bug: 插件导致其他网站不可用
- 修复 content-script.js 中直接访问 `document.body` 的问题
  - 当 body 不存在时延迟初始化
- 修复 index.js 中所有 `document.body.appendChild()` 调用
  - 添加 body 存在性检查
  - 使用 `document.documentElement` 作为后备方案
- 避免在页面加载早期阶段因 body 不存在而抛出错误

## [4.4.6] - 2025-07-22

### 重构

- 重构 Content Script 架构
- 重新组织代码结构，创建独立的 content-script.js 文件
- 保留完整的跨域请求处理功能
- 整合 cURL 弹窗控制功能

### 改进

- 改进调试日志和错误处理机制

## [4.4.5] - 2025-07-21

### 修复

- 修复 cURL 弹窗不显示问题
- 修复 content script 中 this 上下文丢失的问题
- 改进事件监听器的调用方式，确保函数正确执行

### 改进

- 添加详细的调试日志帮助排查问题

## [4.4.0] - 2025-07-16

### 修复

- 修复 Extension context invalidated 错误
- 修复 Issue #10

### 移除

- 完全移除 localStorage 相关功能，避免存储访问冲突
- 移除请求历史记录功能，减少内存占用

### 改进

- 简化扩展功能，专注于核心跨域请求处理

## [4.3.0] - 2025-07-16

### 简化

- 简化扩展功能，移除复杂的域名白名单管理界面
- 强制允许所有域名，简化用户操作
- 移除不必要的调试信息显示

## [4.2.0] - 2025-07-15

### 修复

- 修复 YApi 错误处理和响应格式问题
- 解决 "Cannot read properties of undefined" 错误

### 新增

- 添加用户友好的错误提示界面
- 支持 application/x-www-form-urlencoded 请求格式

## [4.1.0] - 2025-07-15

### 新增

- cURL 命令自动生成功能
- 页面内实时显示 cURL 命令弹窗
- 完整的请求历史管理
- 自动捕获请求头和认证信息
- 一键复制分享功能

## [4.0.1] - 2025-06-26

### 迁移

- 迁移到 Manifest V3

### 新增

- 域名白名单管理功能

### 改进

- 重构代码以提高安全性

---

## 版本链接

[4.4.12]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.11...v4.4.12
[4.4.11]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.10...v4.4.11
[4.4.10]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.9...v4.4.10
[4.4.9]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.8...v4.4.9
[4.4.8]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.7...v4.4.8
[4.4.7]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.6...v4.4.7
[4.4.6]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.5...v4.4.6
[4.4.5]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.0...v4.4.5
[4.4.0]: https://github.com/leeguooooo/cross-request-master/compare/v4.3.0...v4.4.0
[4.3.0]: https://github.com/leeguooooo/cross-request-master/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/leeguooooo/cross-request-master/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/leeguooooo/cross-request-master/compare/v4.0.1...v4.1.0
[4.0.1]: https://github.com/leeguooooo/cross-request-master/releases/tag/v4.0.1

