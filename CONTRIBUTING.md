# Contributing to Cross Request Master

感谢您考虑为 Cross Request Master 做出贡献！本指南将帮助您了解如何参与项目开发。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发设置](#开发设置)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [代码规范](#代码规范)
- [测试指南](#测试指南)

## 行为准则

我们致力于提供一个友好、安全和包容的环境。请尊重所有贡献者，保持建设性的讨论。

## 如何贡献

### 报告 Bug

如果您发现 bug，请[创建一个 issue](https://github.com/leeguooooo/cross-request-master/issues/new?template=bug_report.md)，并包含：

- 清晰的标题和描述
- 复现步骤
- 期望行为和实际行为
- 浏览器版本、操作系统等环境信息
- 相关截图或日志（如有）

### 提出新功能

如果您有新功能建议，请[创建一个 issue](https://github.com/leeguooooo/cross-request-master/issues/new?template=feature_request.md)，说明：

- 功能的使用场景
- 期望的实现方式
- 是否愿意自己实现

### 提交代码

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建一个 Pull Request

## 开发设置

### 前置要求

- Chrome/Edge 浏览器（用于测试扩展）
- 代码编辑器（推荐 VS Code）
- Git

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/leeguooooo/cross-request-master.git
   cd cross-request-master
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目目录

4. **开发工作流**
   ```bash
   # 检查代码风格
   npm run lint
   
   # 自动修复代码风格问题
   npm run lint:fix
   
   # 格式化代码
   npm run format
   
   # 检查格式
   npm run format:check
   
   # 运行测试
   npm test
   
   # 监听模式运行测试
   npm run test:watch
   
   # 生成测试覆盖率报告
   npm run test:coverage
   ```

5. **测试修改**
   - 修改代码后，运行 lint 和 test
   - 在 `chrome://extensions/` 点击刷新按钮
   - 重新加载使用扩展的网页

### 项目结构

```
cross-request-master/
├── manifest.json          # 扩展配置文件
├── background.js          # Service Worker（Manifest V3）
├── content-script.js      # 内容脚本（注入到网页）
├── index.js              # 页面脚本（暴露 API）
├── popup.html/js         # 扩展弹窗
├── icons/                # 图标资源
├── CHANGELOG.md          # 变更日志
├── CONTRIBUTING.md       # 本文件
└── README.md             # 项目文档
```

## 提交规范

我们使用语义化的提交信息，格式如下：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type（必需）

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（不修复 bug 也不添加功能）
- `perf`: 性能优化
- `test`: 添加测试
- `chore`: 构建过程或辅助工具的变动

### 示例

```
feat(api): 添加对 WebSocket 请求的支持

- 实现 WebSocket 连接拦截
- 添加消息日志功能
- 更新文档说明

Closes #123
```

## Pull Request 流程

### 提交前检查清单

- [ ] 代码遵循项目的代码规范
  - [ ] `npm run lint` 通过
  - [ ] `npm run format:check` 通过
- [ ] 已测试所有变更，确保功能正常
  - [ ] `npm test` 通过
  - [ ] 手动测试功能
  - [ ] 测试边界情况（falsy 值等）
- [ ] 已更新相关文档
- [ ] 已在 CHANGELOG.md 中添加条目
- [ ] Commit 信息遵循提交规范
- [ ] 没有引入新的 linter 警告或错误
- [ ] 测试覆盖率没有下降（如适用）

### PR 描述模板

```markdown
## 变更说明

简要描述此 PR 的目的和实现方式。

## 相关 Issue

Fixes #issue_number

## 变更类型

- [ ] Bug 修复
- [ ] 新功能
- [ ] 破坏性变更
- [ ] 文档更新

## 测试

描述您如何测试这些变更：

1. 测试步骤 1
2. 测试步骤 2
3. ...

## 截图（如适用）

添加截图帮助说明变更。

## 检查清单

- [ ] 代码已自测
- [ ] 已更新 CHANGELOG.md
- [ ] 已更新文档
- [ ] 没有引入 breaking changes（或已在 CHANGELOG 中说明）
```

### 代码审查

所有 PR 都需要经过代码审查。审查者会关注：

- **功能正确性**：变更是否达到预期目的
- **代码质量**：是否遵循最佳实践
- **测试覆盖**：是否充分测试
- **文档完整性**：是否更新相关文档
- **向后兼容**：是否破坏现有功能

## 代码规范

### JavaScript 规范

1. **使用严格模式**
   ```javascript
   'use strict';
   ```

2. **变量声明**
   - 使用 `const` 和 `let`，避免 `var`
   - 优先使用 `const`

3. **命名规范**
   - 变量和函数：驼峰命名 `camelCase`
   - 常量：大写蛇形 `UPPER_SNAKE_CASE`
   - 类名：帕斯卡命名 `PascalCase`

4. **Null/Undefined 检查**
   ```javascript
   // ✅ 推荐：显式检查
   if (value !== undefined && value !== null) { ... }
   if (value != null) { ... }  // 同时检查 null 和 undefined
   
   // ❌ 避免：truthy 检查（会过滤 0、false、""）
   if (value) { ... }
   
   // ✅ 使用 nullish coalescing（仅当 null 和 undefined 都应替换时）
   const result = value ?? defaultValue;
   
   // ✅ 只替换 undefined
   const result = value === undefined ? defaultValue : value;
   ```

5. **错误处理**
   - 使用 try-catch 捕获异步错误
   - 提供有意义的错误消息
   - 记录错误日志以便调试

6. **注释**
   - 解释"为什么"而不是"是什么"
   - 标注 HACK、TODO、FIXME 等特殊情况
   - 保持注释与代码同步

### 特别注意

#### Falsy 值处理

扩展需要正确处理所有合法的 JSON 值，包括 falsy 值：

```javascript
// ✅ 正确：这些都是合法的 JSON 值
0        // 数字零
false    // 布尔值
null     // 空值
""       // 空字符串
[]       // 空数组
{}       // 空对象

// ❌ 错误的检查方式
if (response.body) { ... }           // 会跳过 0, false, null, ""
const value = response.body || '';   // 0 和 false 会变成 ''

// ✅ 正确的检查方式
if (response.body != null) { ... }   // 只排除 null 和 undefined
const value = response.body === undefined ? '' : response.body;
```

参见 [FALSY_VALUE_FIX.md](./FALSY_VALUE_FIX.md) 了解详细说明。

## 测试指南

### 手动测试

在提交 PR 前，请测试以下场景：

#### 基础功能测试

1. **YApi 集成测试**
   - 在 YApi 接口页面发送请求
   - 验证 cURL 命令是否正确生成
   - 检查响应是否正确显示

2. **跨域请求测试**
   - 测试 CORS 限制的请求是否能成功
   - 验证请求头是否正确传递
   - 检查响应头是否完整

3. **不同 HTTP 方法**
   - GET、POST、PUT、DELETE、PATCH
   - HEAD、OPTIONS

#### 边界情况测试

1. **Falsy 值响应**
   ```javascript
   // 测试 API 返回这些值时是否正确处理
   0
   false
   null
   ""
   []
   {}
   ```

2. **特殊响应**
   - 超大响应体（> 1MB）
   - 二进制数据
   - 非 JSON 响应（HTML、XML、纯文本）
   - 无响应体（204 No Content）

3. **错误处理**
   - 网络错误（无法连接）
   - 超时
   - 4xx 错误（400、401、404 等）
   - 5xx 错误（500、502、503 等）

4. **相对 URL**
   - 根相对路径：`/api/users`
   - 路径相对：`api/users`
   - 协议相对：`//example.com/api`

### 回归测试

修改代码后，必须验证以下场景没有退化：

- [ ] 基本的 GET/POST 请求
- [ ] cURL 命令生成
- [ ] jQuery ajax 拦截
- [ ] YApi request/response 脚本
- [ ] 错误提示显示
- [ ] 静默模式（非目标网站）

## 版本发布

### 版本号规范

遵循[语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号（Major）**：不兼容的 API 修改
- **次版本号（Minor）**：向下兼容的功能性新增
- **修订号（Patch）**：向下兼容的问题修正

### 发布步骤

1. **更新 CHANGELOG.md**
   - 添加新版本条目
   - 列出所有变更
   - 感谢贡献者

2. **更新 manifest.json**
   ```json
   {
     "version": "4.4.14"
   }
   ```

3. **提交变更**
   ```bash
   git add CHANGELOG.md manifest.json
   git commit -m "chore: release v4.4.14"
   ```

4. **创建 Git 标签**
   ```bash
   git tag -a v4.4.14 -m "Release v4.4.14"
   git push origin main --tags
   ```

5. **创建 GitHub Release**
   - 访问 [Releases 页面](https://github.com/leeguooooo/cross-request-master/releases)
   - 点击 "Draft a new release"
   - 选择标签，复制 CHANGELOG 内容
   - 发布

## 支持与响应

### Issue 响应时间

- **Bug 报告**：通常在 48 小时内回复
- **功能请求**：通常在 1 周内回复
- **安全问题**：优先处理，24 小时内回复

### PR 审查时间

- **简单修复**：通常在 2-3 天内审查
- **复杂功能**：可能需要 1-2 周

### 获取帮助

- **GitHub Issues**：提出问题和建议
- **GitHub Discussions**：技术讨论和交流
- **Email**：紧急或私密问题（如安全漏洞）

## 许可证

通过提交贡献，您同意您的贡献将在 [MIT License](./LICENSE) 下授权。

## 致谢

感谢所有贡献者使 Cross Request Master 变得更好！

---

有问题？欢迎[创建 issue](https://github.com/leeguooooo/cross-request-master/issues/new) 或查看现有[讨论](https://github.com/leeguooooo/cross-request-master/discussions)。

