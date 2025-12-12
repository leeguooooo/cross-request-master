# Chrome Web Store 发布清单

## 必需项

### 1. 隐私政策
- [x] 创建 PRIVACY_POLICY.md
- [ ] 发布到公开 URL（GitHub Pages 或独立网站）
- [ ] 在商店列表中添加隐私政策链接

### 2. manifest.json 审查
- [x] 使用 Manifest V3
- [x] 版本号正确（4.4.13）
- [ ] 考虑缩小权限范围（可选）
- [x] 所有图标文件存在

### 3. 图标和视觉资源
- [x] 16x16 图标
- [x] 32x32 图标
- [x] 48x48 图标
- [x] 128x128 图标
- [ ] 商店展示图标 (440x280)
- [ ] 截图 1-5 张 (1280x800 或 640x400)
- [x] 宣传图片（已有 curl-generation-demo-new.png）

### 4. 商店列表信息

#### 基本信息
- **名称**: Cross Request Master
- **简短描述** (132 字符限制):
  ```
  YApi 接口测试跨域助手 - 开发者工具，支持 CORS 绕过和 cURL 生成
  ```
- **分类**: Developer Tools
- **语言**: 中文（简体）+ 英文（建议）

#### 详细描述
```markdown
Cross Request Master 是专为 API 开发者和测试人员设计的 Chrome 扩展。

主要功能：
• 跨域请求支持 - 在本地开发环境测试跨域 API
• cURL 命令生成 - 自动生成完整的 cURL 命令便于分享
• YApi 智能集成 - 自动识别并优化 YApi 平台体验
• jQuery/Fetch 支持 - 兼容多种请求方式

适用场景：
- 本地开发环境测试跨域 API
- API 接口调试和测试
- 生成 cURL 命令用于文档和协作
- YApi 平台的增强功能

重要提示：
本扩展仅供开发测试使用，请勿在生产环境使用。
扩展会修改网络请求以绕过 CORS 限制，使用时请注意安全。

开源项目：
https://github.com/leeguooooo/cross-request-master

完整文档：
https://github.com/leeguooooo/cross-request-master/blob/main/README.md
```

### 5. 隐私实践声明

需要在开发者控制台填写：

#### 数据收集
- [ ] 不收集任何数据（推荐勾选）
- [ ] 收集个人信息（不勾选）

#### 数据使用
- [ ] 仅本地存储配置信息
- [ ] 不传输到外部服务器

#### 认证状态
- [ ] 不使用远程代码
- [ ] 不使用 eval() 或类似方法

### 6. 权限说明（在商店列表中）

需要清晰说明每个权限的用途：

```
权限说明：

访问所有网站 (host_permissions)
用于拦截和转发跨域请求，实现 CORS 绕过功能。
仅在您访问的页面使用，不后台运行。

本地存储 (storage)
保存扩展启用状态和白名单配置。
数据仅存储在您的浏览器，不上传。

标签页访问 (tabs)
检测当前页面 URL，判断是否为 YApi 等 API 平台。
不收集或存储浏览历史。
```

## 潜在审核问题

### 高风险项
1. **广泛的 host_permissions**
   - 风险：可能被视为过度权限
   - 缓解：详细说明用途，强调开发工具属性
   
2. **绕过 CORS 机制**
   - 风险：可能被视为安全风险
   - 缓解：明确标注仅供开发测试，添加警告

3. **注入所有页面**
   - 风险：content_scripts 匹配所有 URL
   - 缓解：考虑改为按需激活（可选）

### 建议改进（可选）

#### 选项 1：限制默认启用范围
```json
"content_scripts": [
  {
    "matches": [
      "*://*.yapi.io/*",
      "*://*.apifox.cn/*",
      "*://localhost/*",
      "*://127.0.0.1/*"
    ],
    "js": ["content-script.js"]
  }
]
```

#### 选项 2：添加主机权限请求流程
在扩展中添加"请求权限"按钮，而不是默认请求所有域名。

## 提交前检查清单

- [ ] 隐私政策已发布到公开 URL
- [ ] 所有截图已准备（1-5 张）
- [ ] 商店列表描述已准备（中英文）
- [ ] 权限说明已准备
- [ ] 测试扩展在不同场景下正常工作
- [ ] 代码中无 console.log（生产版本）
- [ ] 无 eval() 或不安全代码
- [ ] 打包 .zip 文件（不包含 node_modules, .git 等）

## 打包命令

```bash
# 创建商店提交包
zip -r cross-request-v4.4.13.zip . \
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
  -x "*.crx"
```

## 相关链接

- Chrome Web Store 开发者控制台: https://chrome.google.com/webstore/devconsole
- 扩展发布指南: https://developer.chrome.com/docs/webstore/publish
- 隐私政策要求: https://developer.chrome.com/docs/webstore/program-policies/privacy
- 权限声明指南: https://developer.chrome.com/docs/webstore/program-policies/permissions

## 审核时间

- 首次提交：通常 1-3 个工作日
- 更新版本：通常 几小时 - 1 个工作日
- 如被拒绝：修改后重新提交

## 提高通过率的技巧

1. **详细的描述**：清晰说明扩展用途和目标用户
2. **完整的隐私政策**：涵盖所有数据处理细节
3. **权限说明**：每个权限都要有充分理由
4. **高质量截图**：展示主要功能
5. **安全警告**：明确标注开发工具属性
6. **开源透明**：GitHub 链接增加可信度
7. **响应审核反馈**：快速回复审核员的问题

## 预估通过率

基于当前状态：**60-70%**

提高因素：
- 使用 Manifest V3
- 完整的隐私政策
- 明确的开发工具定位
- 开源项目（增加透明度）
- 代码质量良好

风险因素：
- 广泛的权限请求
- CORS 绕过功能
- 中文为主（建议添加英文）

---

**建议**：先提交审核，如被拒绝，根据反馈意见调整后重新提交。
