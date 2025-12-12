# Chrome Web Store 提审准备完成

## 已完成的准备工作

### 1. 扩展包打包脚本已准备
- 按 `STORE_SUBMISSION_GUIDE.md` 或在仓库根目录执行 `./build-extension.sh` 生成 `cross-request-store.zip`
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

已准备 2 张符合要求的截图，位于 `screenshots/` 目录：

1. **screenshot-1-curl-generation.jpg** (1280x800, JPEG)
   - 展示 cURL 命令生成功能
   - 建议描述：自动生成 cURL 命令 - 在 YApi 中测试接口后，扩展会自动生成完整的 cURL 命令

2. **screenshot-2-popup.jpg** (1280x800, JPEG)  
   - 展示扩展弹出窗口
   - 建议描述：扩展弹出窗口 - 简洁的界面，显示扩展状态和快速操作选项

所有截图符合 Chrome Web Store 要求（1280x800, JPEG, 无 alpha 通道）

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
   - 上传：你刚生成的 `cross-request-store.zip`
   
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
