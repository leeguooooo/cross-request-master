# 技术路线图

本文档记录 Cross Request Master 的技术改进计划，从当前"开源合格"状态提升到"优秀开源项目"。

## 当前状态 (v4.5.0)

✅ **已完成**
- 修复关键 bug（Issue #19 falsy 值处理，Issue #20 GET 参数丢失）
- 添加贡献指南和 Issue/PR 模板
- 添加 ESLint 和 Prettier 配置
- 添加测试框架（Jest）和 68 个测试用例
- 完善文档（技术文档、发布说明）
- **✅ v4.5.0: 模块化重构完成，技术债已清理**
  - helpers 提取到 `src/helpers/`
  - 测试导入真实生产代码
  - 消除"虚假绿灯"风险

## 短期目标 (v4.5.x - 下一个 minor 版本)

### 1. 代码质量改进

#### 1.1 模块化重构 ✅ **已完成 (v4.5.0)**

**已解决的问题**:
- ✅ helpers 已提取到 `src/helpers/`
  - `query-string.js` - buildQueryString 函数
  - `body-parser.js` - bodyToString 函数
- ✅ 测试导入真实生产代码（不再是 mock）
- ✅ 消除"虚假绿灯"风险
- ✅ 减少代码重复（index.js 减少 60 行）

**下一步计划**（后续版本）:
```
src/
├── core/
│   ├── transport.js       # Chrome 消息传递
│   ├── request.js         # 请求编排
│   └── response.js        # 响应处理
├── helpers/
│   ├── body-parser.js     # bodyToString, ensureJsonParsed (可导出)
│   ├── query-string.js    # buildQueryString (可导出)
│   ├── error-builder.js   # buildErrorResponse
│   └── url-resolver.js    # 相对 URL 解析
├── ui/
│   ├── curl-display.js    # cURL 弹窗
│   └── error-display.js   # 错误提示
├── adapters/
│   ├── yapi.js           # YApi 适配器
│   └── jquery.js         # jQuery 拦截
└── index.js              # 主入口，组装各模块
```

**挑战**（已解决）:
- Chrome 扩展需要在 `manifest.json` 中声明所有脚本
- 不能使用 ES modules（Manifest V3 限制）
- 需要保持向后兼容

**已采用方案**:
- ✅ 使用 IIFE 模块模式（保持兼容性）
- ✅ 通过 `window.CrossRequestHelpers` 暴露接口
- ✅ 在 manifest.json 的 web_accessible_resources 中声明
- ✅ content-script.js 按顺序动态注入

**实际用时**: 约 2 小时（快速重构）

#### 1.2 消除重复代码 🔥 **高优先级**

**当前问题**:
- JSON 解析逻辑在 3 处重复
- 错误响应构建在 2 处重复
- 类型检查代码分散各处

**改进计划**:

```javascript
// helpers/body-parser.js

/**
 * 智能解析响应体
 * @param {*} body - 响应体（可能是对象、字符串或标量）
 * @param {string} contentType - Content-Type 头
 * @returns {*} 解析后的数据
 */
function ensureJsonParsed(body, contentType) {
    // 统一的解析逻辑
}

/**
 * 将响应体转为字符串
 * @param {*} body - 响应体
 * @param {*} originalBody - 原始响应体（如需保留格式）
 * @returns {string}
 */
function bodyToString(body, originalBody = null) {
    // 如果提供了原始字符串，优先使用
    if (originalBody && typeof originalBody === 'string') {
        return originalBody;
    }
    // 否则转换
    // ...
}
```

**时间估计**: 1 周

#### 1.3 保留原始响应体 🔶 **中优先级**

**当前问题**:
- `bodyToString()` 重新序列化对象，丢失原始格式
- 可能影响签名验证、字符串比对等场景

**改进计划**:

```javascript
// background.js 中同时保留两种格式
return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,           // 原始字符串
    bodyParsed: parsedBody,       // 解析后的对象/标量
    ok: response.ok
};

// index.js 中使用
response.data = response.bodyParsed;  // YApi 使用解析后的
response.body = response.body;        // 保持原始字符串不变
```

**时间估计**: 3-5 天

### 2. 日志和错误处理规范化

#### 2.1 统一日志规范 🔶 **中优先级**

**当前问题**:
- 日志混合了中文（用户）和英文（开发者）
- 没有日志级别区分
- 调试日志和用户日志混在一起

**改进计划**:

```javascript
// helpers/logger.js

const Logger = {
    levels: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    },
    
    currentLevel: 1, // 默认 INFO
    
    debug(source, message, data) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.log(`[DEBUG][${source}] ${message}`, data);
        }
    },
    
    info(source, message, data) {
        if (this.currentLevel <= this.levels.INFO) {
            console.log(`[INFO][${source}] ${message}`, data);
        }
    },
    
    // 用户可见的错误（中文）
    userError(message) {
        console.error('[用户错误]', message);
        // 显示用户友好的错误提示
    },
    
    // 开发者错误（英文，包含堆栈）
    devError(source, message, error) {
        console.error(`[DEV ERROR][${source}] ${message}`, error);
    }
};
```

**时间估计**: 1 周

#### 2.2 国际化 (i18n) 支持 🔷 **低优先级**

**改进计划**:
- 将所有用户可见的字符串提取到 `i18n/` 目录
- 支持中文和英文切换
- 根据浏览器语言自动选择

**时间估计**: 2 周

### 3. 自动化和 CI/CD

#### 3.1 GitHub Actions CI 🔥 **高优先级**

**改进计划**:

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
  
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      - uses: codecov/codecov-action@v3
  
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: zip -r extension.zip . -x "node_modules/*" ".*"
      - uses: actions/upload-artifact@v3
        with:
          name: extension
          path: extension.zip
```

**时间估计**: 3-5 天

#### 3.2 自动化测试覆盖 🔥 **高优先级**

**当前**: 只有示例测试

**目标覆盖率**:
- Helpers: 90%+
- Core logic: 80%+
- UI components: 60%+

**测试文件结构**:
```
__tests__/
├── helpers/
│   ├── body-parser.test.js
│   ├── error-builder.test.js
│   └── url-resolver.test.js
├── core/
│   ├── transport.test.js
│   └── response.test.js
├── adapters/
│   └── yapi.test.js
└── integration/
    └── full-flow.test.js
```

**时间估计**: 2-3 周

### 4. 性能和可靠性

#### 4.1 错误边界 🔶 **中优先级**

**改进计划**:
- 全局错误捕获
- 优雅降级
- 错误上报（可选，用户同意）

#### 4.2 性能监控 🔷 **低优先级**

**改进计划**:
- 请求时间统计
- 内存使用监控
- 性能瓶颈识别

## 中期目标 (v5.0.x - 下一个 major 版本)

### 1. 架构升级

- 迁移到 TypeScript（类型安全）
- 使用构建工具（Webpack/Rollup）
- 支持 ES Modules

### 2. 功能扩展

- 支持更多 API 管理平台（Postman、Insomnia 等）
- WebSocket 支持
- GraphQL 支持
- 请求录制和重放

### 3. UI 改进

- 更现代的界面设计
- 主题支持（深色模式）
- 自定义快捷键

## 长期目标 (v6.0+)

### 1. 生态系统

- 插件系统（允许第三方扩展）
- Chrome Web Store 发布
- 社区贡献计划

### 2. 企业功能

- 团队协作功能
- 请求模板库
- API 文档生成

## 实施原则

### 向后兼容

- 主版本升级前充分测试
- 提供迁移指南
- 保留旧 API 至少一个 major 版本

### 渐进式改进

- 每个 PR 只解决一个问题
- 小步快跑，频繁发布
- 先重构，再添加新功能

### 社区驱动

- Issue 投票决定优先级
- 接受社区 PR
- 定期发布进度报告

## 如何参与

### 选择任务

1. 查看 [GitHub Issues](https://github.com/leeguooooo/cross-request-master/issues)
2. 找到标记为 `good first issue` 或 `help wanted` 的任务
3. 评论表达兴趣

### 提交改进

1. 创建 issue 讨论方案
2. 获得 maintainer 批准后开始工作
3. 提交 PR 并请求 review

### 讨论路线图

- 在 [GitHub Discussions](https://github.com/leeguooooo/cross-request-master/discussions) 讨论
- 提出新的改进建议
- 投票决定优先级

## 版本发布节奏

- **Patch 版本** (4.4.x): 每 1-2 周，bug 修复
- **Minor 版本** (4.x.0): 每 2-3 个月，新功能
- **Major 版本** (x.0.0): 每 6-12 个月，破坏性变更

---

**最后更新**: 2025-10-17  
**当前版本**: v4.5.0  
**下一个版本**: v4.6.0 (待定)

---

## 版本历史

### v4.5.0 (2025-10-17) - 模块化重构
- **✅ 完成模块化重构，清理技术债**
- 提取 helpers 到 `src/helpers/`（query-string.js, body-parser.js）
- 测试导入真实生产代码，消除"虚假绿灯"风险
- 减少代码重复（index.js -60 行）
- 68 个测试全部通过，覆盖真实生产逻辑

### v4.4.14 (2025-10-17)
- 修复 jQuery $.get 参数丢失（Issue #20）
- 方法名规范化（大小写不敏感）
- 增强 buildQueryString 支持数组和嵌套对象
- 新增 29 个测试（总计 68 个）

### v4.4.13 (2025-10-17)
- 修复 YApi 兼容性（Issue #19）
- 修复 falsy 值处理
- 添加 ESLint、Prettier、Jest
- 完善开源项目基础设施

