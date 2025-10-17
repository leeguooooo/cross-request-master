# Chrome Web Store 提审准备完成

## 已完成的准备工作

### 1. 扩展包已打包
- 文件：`cross-request-store.zip`
- 大小：102 KB
- 内容：包含所有必需文件

### 2. 隐私政策已准备
- 文件：`PRIVACY_POLICY.md`
- 语言：中文 + 英文双语
- 状态：待发布到 GitHub Pages

### 3. 文档已完善
- `CHROME_WEB_STORE_CHECKLIST.md` - 完整清单
- `STORE_SUBMISSION_GUIDE.md` - 提交指南
- `PRIVACY_POLICY.md` - 隐私政策

## 下一步操作（需要手动完成）

### 步骤 1：启用 GitHub Pages（5 分钟）

1. 访问仓库设置：
   ```
   https://github.com/leeguooooo/cross-request-master/settings/pages
   ```

2. 配置 Pages：
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
   - 点击 Save

3. 等待部署完成（1-2 分钟）

4. 隐私政策将可访问：
   ```
   https://leeguooooo.github.io/cross-request-master/PRIVACY_POLICY.html
   ```

### 步骤 2：准备截图（15 分钟）

需要 3-5 张截图，建议尺寸：1280x800

**建议内容**：
1. 扩展弹出窗口
2. YApi 中的 cURL 生成效果
3. crossRequest API 使用示例
4. 成功的跨域请求演示

**截图工具**：
- macOS: Cmd+Shift+4（按空格键截取窗口）
- Chrome DevTools: Cmd+Shift+P -> "Capture screenshot"

### 步骤 3：注册开发者账号（如未注册）

1. 访问：https://chrome.google.com/webstore/devconsole
2. 支付一次性注册费：$5 USD
3. 完成账号验证

### 步骤 4：提交扩展

1. **登录开发者控制台**
   ```
   https://chrome.google.com/webstore/devconsole
   ```

2. **点击"New Item"（新建项目）**

3. **上传扩展包**
   - 上传：`cross-request-store.zip`
   
4. **填写商店列表信息**

#### 基本信息
```
名称：Cross Request Master

简短描述（132 字符以内）：
YApi 接口测试跨域助手 - 开发者工具，支持 CORS 绕过和 cURL 生成

详细描述：
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

GitHub: https://github.com/leeguooooo/cross-request-master
文档: https://github.com/leeguooooo/cross-request-master/blob/main/README.md

类别：Developer Tools
语言：中文（简体）
```

5. **隐私设置**
```
隐私政策 URL：
https://leeguooooo.github.io/cross-request-master/PRIVACY_POLICY.html

数据收集：
☑ 不收集用户数据
☑ 不使用远程代码
```

6. **权限说明**

为每个权限添加说明：

```
host_permissions (<all_urls>):
用于拦截和转发跨域请求，实现 CORS 绕过功能。仅在您访问的页面使用，不后台运行。

declarativeNetRequest:
用于添加必要的 CORS 请求头，使跨域请求成功。不记录或存储任何请求数据。

storage:
保存扩展启用状态和白名单配置。数据仅存储在您的浏览器，不上传。

tabs:
检测当前页面 URL，判断是否为 YApi 等 API 平台。不收集或存储浏览历史。

scripting:
向页面注入 crossRequest API 供开发使用。仅提供功能接口，不收集数据。
```

7. **上传截图**
   - 上传准备好的 3-5 张截图

8. **提交审核**
   - 检查所有信息
   - 点击"Submit for review"

## 审核时间

- 预计审核时间：1-3 个工作日
- 通过率预估：60-70%

## 如果被拒绝

不要担心！根据邮件中的反馈意见调整后重新提交即可。

常见原因：
1. 权限说明不够详细 → 补充说明
2. 隐私政策不完整 → 补充细节
3. 描述不够清晰 → 添加英文版本

## 需要帮助？

查看详细文档：
- `STORE_SUBMISSION_GUIDE.md` - 完整提交指南
- `CHROME_WEB_STORE_CHECKLIST.md` - 检查清单
- `PRIVACY_POLICY.md` - 隐私政策

---

**准备就绪！** 

打包文件：`cross-request-store.zip`  
隐私政策：待 GitHub Pages 部署完成

**下一步：访问 GitHub 仓库设置启用 Pages，然后登录 Chrome Web Store 开发者控制台提交。**

