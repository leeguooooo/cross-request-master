# Chrome Web Store 提审准备完成

## 已完成的准备工作

### 1. 扩展包打包脚本已准备
- 按 `STORE_SUBMISSION_GUIDE.md` 或在仓库根目录执行 `./build-extension.sh` 生成 `cross-request-master-v*.zip`
- 生成的压缩包需包含所有必需文件（manifest/background/content-script/index/popup/icons/src 等）

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

### 步骤 2：上传截图（已准备好）

已准备 3 张符合要求的截图，位于 `screenshots/store/` 目录：

1. **store-1-yapi-interface-1280x800.jpg** (1280x800, JPEG)
   - 展示 YApi 接口详情页（包含带 `{param}` 的接口路径示例）
   - 建议描述：YApi 接口详情页 - 路径参数清晰展示，配合运行页可快速测试

2. **store-2-yapi-run-curl-1280x800.jpg** (1280x800, JPEG)
   - 展示 YApi「运行」页内嵌 cURL 展示与路径参数填写
   - 建议描述：YApi 运行增强 - 内嵌展示 cURL，路径参数缺失时引导填写

3. **store-3-popup-1280x800.jpg** (1280x800, JPEG)
   - 展示扩展弹出窗口
   - 建议描述：扩展弹出窗口 - 显示扩展状态与问题反馈入口

所有截图符合 Chrome Web Store 要求（1280x800 或 640x400、JPEG、无 alpha 通道）

### 步骤 2.1：上传宣传图块（已准备好）

已准备 2 张符合要求的宣传图块，位于 `images/store/` 目录：

1. **promo-small-440x280.jpg** (440x280, JPEG)
   - 小型宣传图块

2. **promo-top-1400x560.jpg** (1400x560, JPEG)
   - 顶部宣传图块

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
   - 上传：你刚生成的 `cross-request-master-v*.zip`
   
4. **填写商店列表信息**

#### 基本信息
```
名称：Cross Request Master

简短描述（132 字符以内）：
YApi 接口测试跨域助手 - 开发者工具，支持 CORS 绕过和 cURL 生成

详细描述：
Cross Request Master 是面向 API 开发/测试的 Chrome 扩展：绕过 CORS 发请求、自动生成 cURL，并对 YApi「运行」页做增强。

主要功能：
• 跨域请求支持（CORS bypass）- 由扩展后台代发请求
• 内嵌 cURL 面板 - 在 YApi「运行」页 URL 下方展示并一键复制
• 路径参数引导 - URL 含 `{param}` 时提示填写，避免请求失败
• AI/MCP 导出 - 一键生成 MCP 配置/复制接口信息给 AI
• jQuery/Fetch 兼容 - 支持多种请求方式与脚本能力

重要提示：
本扩展仅供开发测试使用，请勿在生产环境使用。
扩展不会上传你的请求数据，所有配置仅保存在本地浏览器。

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

storage:
保存扩展启用状态和白名单配置。数据仅存储在您的浏览器，不上传。

tabs:
检测当前页面 URL，判断是否为 YApi 等 API 平台。不收集或存储浏览历史。
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

打包文件：按指南生成 `cross-request-store.zip`  
隐私政策：待 GitHub Pages 部署完成

**下一步：访问 GitHub 仓库设置启用 Pages，然后登录 Chrome Web Store 开发者控制台提交。**
