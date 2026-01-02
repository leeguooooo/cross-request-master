# Chrome Web Store 提交指南

## 审核通过率评估

### 当前状态：60-70% 通过率

#### 有利因素
1. **Manifest V3** - 符合最新标准
2. **开源项目** - GitHub 公开，透明度高
3. **明确用途** - 开发测试工具定位清晰
4. **代码质量** - 通过测试和 lint 检查
5. **隐私政策** - 已创建完整政策文档

#### 风险因素
1. **广泛权限** - `<all_urls>` 会被重点审查
2. **CORS 绕过** - 核心功能涉及安全机制
3. **全局注入** - content_scripts 匹配所有网站
4. **语言单一** - 主要是中文，建议添加英文

## 快速提交步骤（30 分钟）

### 步骤 1：发布隐私政策（5 分钟）

选项 A：使用 GitHub Pages（推荐）
```bash
# 1. 在 GitHub 仓库设置中启用 Pages
# 2. 选择 main 分支
# 3. 隐私政策 URL 将是：
# https://leeguooooo.github.io/cross-request-master/PRIVACY_POLICY.html
```

选项 B：创建 Gist
```bash
# 1. 访问 https://gist.github.com/
# 2. 创建新 Gist，粘贴 PRIVACY_POLICY.md 内容
# 3. 记录 Gist URL
```

### 步骤 2：准备截图（15 分钟）

需要 3-5 张截图，建议尺寸：1280x800

**建议截图内容**：
1. 扩展图标和弹出窗口
2. YApi 中使用效果（cURL 生成）
3. crossRequest API 使用示例
4. 配置界面（如果有）
5. 成功的跨域请求示例

**截图工具**：
- macOS: Cmd+Shift+4 (然后空格键截取窗口)
- Windows: Snipping Tool / Snip & Sketch
- Chrome DevTools: Cmd/Ctrl+Shift+P -> "Capture screenshot"

### 步骤 3：打包扩展（5 分钟）

```bash
cd /Users/leo/Downloads/cross-request-master

# 推荐：使用仓库脚本打包（会生成 build/ 和 cross-request-master-v*.zip）
./build-extension.sh

# 方式 1：只包含必要文件
zip -r cross-request-store.zip \
  manifest.json \
  background.js \
  content-script.js \
  index.js \
  popup.html \
  popup.js \
  jquery-3.1.1.js \
  icon.png \
  icons/

# 方式 2：排除不需要的文件
zip -r cross-request-store.zip . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".github/*" \
  -x "tests/*" \
  -x "*.md" \
  -x ".eslintrc.json" \
  -x ".prettierrc.json" \
  -x ".prettierignore" \
  -x ".eslintignore" \
  -x ".gitignore" \
  -x "package*.json" \
  -x "*.pem" \
  -x "*.crx" \
  -x ".DS_Store"

# 验证压缩包内容
unzip -l cross-request-store.zip
```

### 步骤 4：填写商店信息（5 分钟）

访问：https://chrome.google.com/webstore/devconsole

#### 基本信息
- **名称**: Cross Request Master
- **简短描述**: YApi 接口测试跨域助手 - 开发者工具，支持 CORS 绕过和 cURL 生成
- **类别**: Developer Tools
- **语言**: 中文（简体）

#### 详细描述（复制此内容）
```
Cross Request Master 是面向 API 开发/测试的 Chrome 扩展：绕过 CORS 发请求、自动生成 cURL，并对 YApi「运行」页做增强。

主要功能：
• 跨域请求支持（CORS bypass）- 由扩展后台代发请求
• 内嵌 cURL 面板 - 在 YApi「运行」页 URL 下方展示并一键复制
• 路径参数引导 - URL 含 `{param}` 时提示填写，避免请求失败
• 固定 Header - 为跨域请求自动追加自定义 Header
• AI/MCP 导出 - 一键生成 MCP 配置/复制接口信息给 AI
• jQuery/Fetch 兼容 - 支持多种请求方式与脚本能力

重要提示：
本扩展仅供开发测试使用，请勿在生产环境使用。
扩展不会上传你的请求数据，所有配置仅保存在本地浏览器。

GitHub: https://github.com/leeguooooo/cross-request-master
文档: https://github.com/leeguooooo/cross-request-master/blob/main/README.md
```

#### 隐私设置
- **隐私政策 URL**: https://leeguooooo.github.io/cross-request-master/PRIVACY_POLICY.html
- **不收集用户数据**: 勾选
- **不使用远程代码**: 勾选

#### 权限说明（单项说明）
```
host_permissions (<all_urls>):
用于拦截和转发跨域请求，实现 CORS 绕过功能。仅在您访问的页面使用，不后台运行。

storage:
保存扩展启用状态和白名单配置。数据仅存储在您的浏览器，不上传。

tabs:
检测当前页面 URL，判断是否为 YApi 等 API 平台。不收集或存储浏览历史。
```

## 提交后

### 预期时间线
- **审核时间**: 1-3 个工作日
- **通过**: 自动发布到商店
- **被拒**: 收到邮件说明原因

### 如果被拒绝

常见拒绝原因及对策：

#### 1. "权限过于广泛"
**对策**：
- 回复说明这是开发工具，需要访问任意 API
- 强调不收集数据，仅本地处理
- 提供技术说明文档

#### 2. "隐私政策不完整"
**对策**：
- 补充更详细的数据处理说明
- 添加所有权限的具体用途
- 确保政策 URL 可访问

#### 3. "可能危害用户安全"
**对策**：
- 强调仅供开发测试使用
- 添加更明显的警告提示
- 考虑添加"高级用户"模式

#### 4. "描述不清晰"
**对策**：
- 添加英文描述
- 提供更多使用场景说明
- 添加视频演示（可选）

## 提高通过率的技巧

### 1. 强调开发工具属性
在所有描述中反复强调：
- "开发者工具"
- "仅供开发测试"
- "不适用于生产环境"

### 2. 提供详细文档
- GitHub README 完整
- 隐私政策详尽
- 使用说明清晰

### 3. 透明度
- 开源代码
- 所有权限都有说明
- 不收集数据的承诺

### 4. 专业性
- 代码质量高
- 有测试覆盖
- 有 CI/CD

### 5. 积极响应
- 快速回复审核员问题
- 根据反馈迅速修改
- 保持沟通

## 需要帮助？

如遇到问题：
1. 查看 Chrome Web Store 开发者政策
2. 访问 Chrome Extensions 开发者论坛
3. 提交 GitHub Issue

---

**建议**: 先按快速提交流程提交，根据审核反馈再迭代优化。
