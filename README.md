# Cross Request Master

一个用于绕过 CORS 限制的 Chrome 扩展，主要用于 YApi 接口管理平台。已升级至 Manifest V3。

🎉 **专业版Chrome扩展**：企业级跨域解决方案！

## 功能特性

- ✅ 支持跨域请求，绕过浏览器 CORS 限制
- ✅ 域名白名单管理，提高安全性
- ✅ 支持 jQuery Ajax 和原生 Fetch API
- ✅ 已迁移至 Chrome Manifest V3
- ✅ 更安全的权限管理
- ✅ 专业级Chrome扩展解决方案

## 安装方法

### Chrome 扩展版本

1. 克隆或下载此仓库
```bash
git clone git@github.com:leeguooooo/cross-request-master.git
```

2. 打开 Chrome 浏览器，进入扩展管理页面
   - 在地址栏输入 `chrome://extensions/`
   - 或者通过菜单：更多工具 -> 扩展程序

3. 开启"开发者模式"（右上角开关）

4. 点击"加载已解压的扩展程序"

5. 选择项目文件夹

## 使用方法

### 基本使用

扩展会自动注入跨域请求功能到页面中。你可以通过以下方式使用：

```javascript
// 使用 crossRequest.ajax (jQuery 风格)
crossRequest.ajax({
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token'
  },
  data: { key: 'value' },
  success: function(data) {
    console.log('Success:', data);
  },
  error: function(err) {
    console.error('Error:', err);
  }
});

// 使用 crossRequest.fetch (Promise 风格)
crossRequest.fetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer token'
  }
}).then(response => {
  console.log('Response:', response);
}).catch(error => {
  console.error('Error:', error);
});
```

### 域名白名单管理

1. 点击浏览器工具栏中的扩展图标
2. 在弹出窗口中管理允许的域名
3. 可以添加特定域名或使用通配符（如 `*.example.com`）
4. 不建议使用"允许所有域名"选项，存在安全风险

### 跨域问题解决

如果遇到跨域请求失败的问题，请按照以下步骤操作：

![扩展设置截图](https://share.cleanshot.com/s9fxWkTm)

**重要提示**：如果遇到跨域问题，需要在插件弹出页面中勾选相关选项：

1. 点击浏览器工具栏中的 Cross Request 扩展图标
2. 在弹出的管理页面中，勾选"允许所有域名"选项
3. 或者添加特定的域名到白名单中
4. 刷新需要跨域请求的页面

⚠️ **注意**：勾选"允许所有域名"存在安全风险，建议仅在开发环境使用。

## 安全注意事项

⚠️ **重要安全提示**：

1. **仅在开发环境使用**：此扩展会绕过浏览器的 CORS 安全策略，请勿在生产环境使用
2. **限制域名访问**：始终使用域名白名单，避免允许所有域名
3. **定期审查权限**：定期检查并清理不需要的域名权限
4. **不要在敏感网站使用**：避免在银行、支付等敏感网站启用此扩展

## 技术优势

- **企业级稳定性**：基于Chrome Manifest V3，更加稳定可靠
- **高性能处理**：原生扩展架构，性能优异
- **专业配置**：独立的管理界面，功能全面
- **安全可控**：严格的域名白名单管理

## 技术细节

### Manifest V3 迁移

此扩展已从 Manifest V2 迁移到 V3，主要变化包括：

- 使用 Service Worker 替代后台页面
- 使用新的消息传递机制替代 blocking webRequest API
- 更严格的权限管理
- 改进的安全性

### 工作原理

**Chrome 扩展工作原理**：
1. 内容脚本注入到页面中，拦截跨域请求
2. 将请求转发到扩展的 Service Worker
3. Service Worker 使用 fetch API 发起实际请求（不受 CORS 限制）
4. 将响应返回给页面

该扩展通过Service Worker架构实现安全可靠的跨域请求处理。

## 开发

### 项目结构

```
cross-request-master/
├── manifest.json           # 扩展配置文件 (Manifest V3)
├── background.js           # Service Worker 脚本
├── response.js             # 内容脚本
├── index.js               # 注入到页面的脚本
├── popup.html             # 扩展弹出窗口
├── popup.js               # 弹出窗口脚本
├── icon.png               # 扩展图标
└── README.md              # 本文件
```

### 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 更新日志

### v4.0.0 (2025-06-26)
- 迁移到 Manifest V3
- 添加域名白名单管理功能
- 重构代码以提高安全性
- 移除不安全的请求头修改功能
- 使用现代 JavaScript 语法重写
- 🎉 专注Chrome扩展专业版本