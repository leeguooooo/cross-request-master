# 更新日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [4.5.8] - 2025-12-17

### 新增

- **YApi 接口页 AI 辅助** - 在接口详情页右上角新增按钮
  - 一键生成并复制 MCP 配置（Cursor / Codex / Gemini CLI / Claude Code）
  - 一键复制「当前接口页」给 AI（Markdown + 表格，避免 JSON schema 歧义）

### 修复

- **页面加载失败** - 非 YApi 网站不再默认拦截 `$.ajax`，避免相对路径请求导致页面异常（Issue #27）

### 改进

- **静默模式日志** - 非目标网站不再刷屏输出注入/调试日志，避免干扰页面调试

## [4.5.7] - 2025-12-12

### 修复

- **商店权限合规** - 移除未使用的权限 `declarativeNetRequest` / `declarativeNetRequestWithHostAccess` / `scripting`

### 改进

- **开发工具链** - 迁移到 pnpm，升级 ESLint 9 与 Jest 30

## [4.5.6] - 2025-12-12

### 修复

- **文件上传** - 支持 `multipart/form-data` / FormData 文件上传（Issue #14）
  - index.js 序列化 FormData/File/Blob 以跨上下文传输
  - background.js 反序列化并自动移除手动 `Content-Type`，让浏览器设置 boundary
- **YApi 脚本兼容** - fallback 路径也会解析 JSON 字符串（Issue #22）

### 改进

- **日志安全** - 控制台输出不会被大响应体淹没
  - 新增 `src/helpers/logger.js` 提供 `safeLogResponse`
  - background/index 使用安全日志助手，输出超过 10KB 时自动截断并提示
  - 避免 content-script 控制台被巨型响应体切割，便于调试
  - 新增单元测试覆盖截断逻辑，防止回归
- **测试质量** - helpers 与生产代码保持一致
  - `tests/helpers.test.js` 直接导入 `response-handler`，覆盖 `processBackgroundResponse` 和 `buildYapiCallbackParams`
  - 移除遗留提醒注释，防止测试与生产代码脱节

## [4.5.0] - 2025-10-17

### 新增

- **模块化架构** - 技术债清理完成 ✅
  - 提取 helpers 到独立模块 `src/helpers/`
    - `src/helpers/query-string.js` - buildQueryString 函数
    - `src/helpers/body-parser.js` - bodyToString 函数
  - helpers 支持 CommonJS 导出，可被测试导入
  - helpers 通过 `window.CrossRequestHelpers` 导出，供 index.js 使用

- **测试真实性保障** - 消除"虚假绿灯"风险 ✅
  - 测试现在导入真实的生产代码，而不是 mock 实现
  - 如果生产代码退化，测试会立即失败
  - 68 个测试全部通过，覆盖真实生产逻辑

### 修复

- **🔴 Critical: 修复脚本加载竞态条件** (Code Review 反馈)
  - 问题: 动态注入的脚本默认 `async = true`，可能导致 index.js 在 helpers 之前执行
  - 后果: `window.CrossRequestHelpers` 未定义，扩展崩溃
  - 修复: 使用链式加载 + `script.async = false` 确保执行顺序
  - content-script.js 现在按顺序等待每个 helper 加载完成

- **🔴 Critical: 添加安全 Fallback Helpers** (Code Review 反馈)
  - 问题: helpers 加载失败时，调用 `helpers.buildQueryString()` 会抛出 TypeError
  - 后果: 第一个 GET 请求就会让扩展停止工作
  - 修复: 在 index.js 中提供内联 fallback 实现
  - 现在即使外部 helpers 加载失败，扩展仍能正常工作

### 改进

- **代码组织**
  - index.js 减少 60 行代码（删除重复的 helper 定义）
  - 更清晰的职责分离：helpers vs 业务逻辑
  - content-script.js 按顺序注入 helpers，确保依赖正确加载

- **可维护性**
  - 单一数据源：helper 逻辑只在一处定义
  - 更容易修复 bug：修改 helper 后，测试立即验证
  - 更容易扩展：新增 helper 只需创建新模块

### 技术细节

- **加载顺序**
  1. content-script.js 动态注入
  2. src/helpers/query-string.js 加载
  3. src/helpers/body-parser.js 加载
  4. index.js 使用 `window.CrossRequestHelpers.*`

- **兼容性**
  - Chrome 扩展 Manifest V3 兼容
  - IIFE 模式保持不变（非 ESM）
  - 向后兼容：API 无变化

### 文档

- 更新 tests/helpers.test.js 注释，说明 v4.5.0 已完成模块化
- 更新 `docs/ROADMAP.md`，标记模块化重构为已完成

## [4.4.14] - 2025-10-17

### 修复

- **修复 jQuery $.get 参数丢失问题**（Issue #20）
  - **问题**: GET 请求的参数被当作 body 发送，导致 Fetch API 报错 "Request with GET/HEAD method cannot have body"
  - **根本原因**: 
    1. GET 请求的 data 被直接赋值给 body
    2. method 比较区分大小写，`'get'` 不匹配 `'GET'`
  - **修复内容**:
    - **method 规范化**: `(options.method || 'GET').toUpperCase()` 确保大小写不敏感
    - **GET 参数处理**: 将 data 转换为查询字符串附加到 URL，body 设为 undefined
    - **增强 buildQueryString**: 支持数组（`ids=[1,2,3]` → `ids=1&ids=2&ids=3`）和嵌套对象（JSON 序列化）
  - **测试覆盖**: 新增 29 个测试（总计 68 个），覆盖大小写、数组、对象等场景

### 已知限制（历史）

- 测试使用 mock helper 实现而非真实代码（技术债，计划 v4.5.0 修复）
- 原因：index.js 使用 IIFE 模式，不支持 export
- 风险：如果 index.js 退化，测试可能仍然通过
- ~~缓解：在测试文件顶部标注风险提示（已移除）~~
- ✅ 已在 v4.5.x 中解决：helpers 模块化，测试直接导入真实代码（含 response-handler 覆盖）

## [4.4.13] - 2025-10-17

### 修复

- 修复 YApi request/response 脚本兼容性问题（Issue #19）
  - **background.js**: `context.responseData` 现在正确返回解析后的 JSON 对象
  - **index.js**: 添加类型检查，避免对已解析的对象重复调用 `JSON.parse()`
  - 对于 JSON 响应，background 返回解析后的对象；index.js 检测类型后直接使用
  - 对于非 JSON 响应，保持返回字符串
  - 确保 `response.body` 始终为字符串格式以保持向后兼容
  - 修复所有可能导致 `TypeError` 的 JSON 解析点（3处）
  - 恢复与官方插件的完整兼容性

- **修复合法 JSON 标量值丢失问题**（代码审查发现）
  - 修复 `response.body && ...` truthy 检查会过滤掉 `0`、`false`、`null`、`""` 等合法 JSON 值
  - 改用显式的 `!= null` 检查，避免丢失合法的 falsy 标量值
  - **关键修复**: 将 `data: parsedData ?? {}` 改为 `parsedData === undefined ? {} : parsedData`
  - 原因：`??` 会把 `null` 也替换为 `{}`，但 `null` 是合法的 JSON 响应值
  - 现在只有 `undefined` 会被替换为 `{}`，保留所有合法值（包括 `null`、`0`、`false`、`""`）
  - 修复 `response.body || ''` 会将 `0`、`false` 转换为空字符串的问题
  - 使用 `String()` 转换以保留标量值的正确表示
  - 新增 `bodyToString()` helper 函数统一处理字符串转换逻辑
  - 修复所有使用 truthy 检查的位置（7处，包括最关键的返回值）

- **Chrome 扩展兼容性修复**
  - 修复 Chrome 不允许加载以下划线开头的目录的问题
  - 重命名 `__tests__/` 为 `tests/`，使扩展可以正常加载
  - 更新相关配置文件（package.json, .eslintignore, .prettierignore）

- **代码格式和规范修复**
  - 应用 Prettier 格式化到所有 JS 和 JSON 文件
  - 修复 ESLint 缩进错误（21 处）
  - 修复 README.md 和 CHANGELOG.md 引用不存在文件的问题
  - **安全修复**: 添加 `.gitignore` 忽略 Chrome 扩展敏感文件（*.pem, *.crx）
  - 修复 Jest 版本不匹配问题（jest@29.7.0 vs jest-environment-jsdom@30.2.0）

### 改进

- **代码质量提升**
  - 提取 `bodyToString()` helper 函数，减少代码重复
  - 使用更精确的 null/undefined 检查替代 truthy 判断
  - 改善日志输出，增加 value 字段帮助调试
  - 代码更易理解和维护

- **开源项目基础设施完善**
  - 新增 `CONTRIBUTING.md` 贡献指南
    - 开发环境设置（npm install, npm test, npm run lint）
    - 代码规范和最佳实践（ESLint + Prettier）
    - 提交和 PR 流程
    - Falsy 值处理特别说明
  - 新增 GitHub Issue 模板
    - Bug 报告模板（`.github/ISSUE_TEMPLATE/bug_report.md`）
    - 功能请求模板（`.github/ISSUE_TEMPLATE/feature_request.md`）
  - 新增 Pull Request 模板（`.github/pull_request_template.md`）
  - 新增 `docs/ROADMAP.md` 技术路线图
    - 短期目标：模块化重构、消除重复代码
    - 中期目标：TypeScript 迁移、功能扩展
    - 长期目标：插件系统、团队协作

- **开发工具链**
  - 新增 ESLint 配置（`.eslintrc.json`）
    - 代码规范检查
    - 自动修复支持
  - 新增 Prettier 配置（`.prettierrc.json`）
    - 代码格式化
    - 统一代码风格
  - 新增 `package.json`
    - npm scripts（lint, format, test）
    - Jest 测试框架配置
    - 测试覆盖率阈值设置
  - 新增单元测试（`tests/helpers.test.js`）
    - **39 个测试用例**，全部通过 ✅
    - bodyToString 函数测试（12 个）
    - parsedData 处理测试（8 个）
    - nullish 检查测试（12 个）
    - JSON 解析守卫测试（7 个）
    - 覆盖所有 falsy 值场景（0、false、null、""）
  - 新增 `.gitignore` 和 `.eslintignore` 文件

### 文档

- 完善项目文档结构，提升开源项目规范性
- 添加版本发布流程说明
- 添加支持与响应时间说明

### 致谢

- 感谢 @rank97 在 issue #19 中的详细反馈
- 感谢 @leeguooooo 的深入代码审查，发现 falsy 值处理的关键问题，并提出开源项目规范化建议

## [4.4.12] - 2025-10-17

### 修复

- 修复相对 URL 解析问题（PR #17）
  - 根相对路径（如 `/config/post_data`）现在正确解析为 `location.origin + path`
  - 其他相对路径（如 `api/endpoint`）使用 `new URL(path, location.href)` 解析
  - 添加错误处理，避免无效 URL 导致崩溃

- 修复 HTTP 方法大小写敏感问题（PR #17）
  - `background.js` 中的方法检查改为大小写不敏感
  - 避免混合大小写方法（如 `Get`、`hEaD`）导致 fetch 错误
  - 符合 HTTP 规范（RFC 7231）

### 致谢

- 感谢 @justopt796 提交 PR #17

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

- 添加详细的测试指南（`docs/TESTING.md`）
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

[4.4.13]: https://github.com/leeguooooo/cross-request-master/compare/v4.4.12...v4.4.13
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
