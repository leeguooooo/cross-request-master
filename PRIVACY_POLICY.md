# 隐私政策 / Privacy Policy

**最后更新日期**: 2025-10-17

## 中文版

### 数据收集和使用

Cross Request Master 扩展承诺保护您的隐私。

#### 我们收集什么数据？

**本扩展不收集、存储或传输任何个人身份信息。**

扩展仅在本地存储以下数据：
- 扩展启用/禁用状态（存储在浏览器本地）
- 用户自定义的域名白名单配置（如果设置）

#### 数据如何使用？

- **网络请求处理**: 扩展会拦截和转发网络请求以绕过 CORS 限制，但不记录请求内容
- **本地存储**: 所有配置数据仅存储在您的浏览器中，不会上传到任何服务器
- **无追踪**: 不使用任何分析工具或追踪技术

#### 权限说明

扩展请求以下权限：

1. **host_permissions (所有网站访问)**
   - 用途: 拦截和转发跨域请求
   - 数据处理: 仅在内存中处理，不存储
   
2. **declarativeNetRequest**
   - 用途: 修改请求头以绕过 CORS
   - 数据处理: 不涉及数据存储
   
3. **storage**
   - 用途: 保存扩展配置（启用状态、白名单）
   - 数据范围: 仅本地，不同步

4. **tabs**
   - 用途: 检测当前页面 URL 以判断是否启用扩展
   - 数据处理: 不存储 URL 信息

5. **scripting**
   - 用途: 注入 crossRequest API 到页面
   - 数据处理: 仅功能性注入，不收集数据

#### 第三方服务

本扩展不使用任何第三方服务，不向任何第三方传输数据。

#### 安全提示

⚠️ **重要警告**：
- 本扩展会绕过浏览器的 CORS 安全机制
- 仅应在开发测试环境使用
- 不要在银行、支付等敏感网站启用
- 使用时需遵守目标 API 的使用条款

#### 用户权利

您可以随时：
- 禁用或卸载扩展
- 清除浏览器本地存储以删除所有配置数据

#### 联系方式

如有隐私相关问题，请通过以下方式联系：
- GitHub Issues: https://github.com/leeguooooo/cross-request-master/issues
- Email: [您的邮箱]

---

## English Version

### Data Collection and Use

Cross Request Master extension is committed to protecting your privacy.

#### What Data Do We Collect?

**This extension does NOT collect, store, or transmit any personally identifiable information.**

The extension only stores the following data locally:
- Extension enable/disable status (stored in browser local storage)
- User-defined domain whitelist configuration (if set)

#### How is Data Used?

- **Network Request Processing**: The extension intercepts and forwards network requests to bypass CORS restrictions, but does not log request content
- **Local Storage**: All configuration data is stored only in your browser and is not uploaded to any server
- **No Tracking**: Does not use any analytics tools or tracking technologies

#### Permission Explanations

The extension requests the following permissions:

1. **host_permissions (access to all websites)**
   - Purpose: Intercept and forward cross-origin requests
   - Data handling: Processed in memory only, not stored
   
2. **declarativeNetRequest**
   - Purpose: Modify request headers to bypass CORS
   - Data handling: No data storage involved
   
3. **storage**
   - Purpose: Save extension settings (enable status, whitelist)
   - Scope: Local only, not synced

4. **tabs**
   - Purpose: Detect current page URL to determine if extension should be enabled
   - Data handling: URL information is not stored

5. **scripting**
   - Purpose: Inject crossRequest API into pages
   - Data handling: Functional injection only, no data collection

#### Third-Party Services

This extension does not use any third-party services and does not transmit data to any third parties.

#### Security Notice

⚠️ **Important Warning**:
- This extension bypasses browser's CORS security mechanism
- Should only be used in development and testing environments
- Do not enable on sensitive websites (banking, payment, etc.)
- Must comply with target API's terms of service

#### Your Rights

You can at any time:
- Disable or uninstall the extension
- Clear browser local storage to delete all configuration data

#### Contact

For privacy-related questions, please contact:
- GitHub Issues: https://github.com/leeguooooo/cross-request-master/issues
- Email: [Your Email]

---

## 更新历史 / Update History

- **2025-10-17**: 初始版本 / Initial version

