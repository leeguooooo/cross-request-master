# Cross Request Master

一个用于绕过 CORS 限制的 Chrome 扩展，主要用于 YApi 接口管理平台。已升级至 Manifest V3。

🎉 **新增**：现已支持油猴脚本版本！

## 功能特性

- ✅ 支持跨域请求，绕过浏览器 CORS 限制
- ✅ 域名白名单管理，提高安全性
- ✅ 支持 jQuery Ajax 和原生 Fetch API
- ✅ 已迁移至 Chrome Manifest V3
- ✅ 更安全的权限管理
- ✅ **新增油猴脚本版本**，支持更多浏览器

## 安装方法

### 方式一：油猴脚本版本（推荐）

1. 安装油猴扩展
   - Chrome: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox: [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/)
   - Edge: [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. 安装脚本
   - [点击这里安装脚本](https://raw.githubusercontent.com/leeguooooo/cross-request-master/main/cross-request.user.js)
   - 或访问 [Greasy Fork](https://greasyfork.org/) 搜索 "Cross Request"

3. 配置域名
   - 点击油猴图标 → Cross Request → "管理跨域域名"
   - 添加需要允许跨域的域名

### 方式二：Chrome 扩展版本

适用于需要更强大功能或企业环境的用户。

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

## 安全注意事项

⚠️ **重要安全提示**：

1. **仅在开发环境使用**：此扩展会绕过浏览器的 CORS 安全策略，请勿在生产环境使用
2. **限制域名访问**：始终使用域名白名单，避免允许所有域名
3. **定期审查权限**：定期检查并清理不需要的域名权限
4. **不要在敏感网站使用**：避免在银行、支付等敏感网站启用此扩展

## 版本对比

| 特性 | Chrome 扩展版 | 油猴脚本版 |
|------|--------------|------------|
| 安装方式 | 开发者模式加载 | 一键安装 |
| 浏览器支持 | 仅 Chrome/Edge | Chrome/Firefox/Edge/Safari |
| 自动更新 | 需手动更新 | 自动更新 |
| 性能 | 更好 | 良好 |
| 配置界面 | 独立弹窗 | 集成在页面 |
| 适用场景 | 企业/专业开发 | 个人开发者 |

## 技术细节

### Manifest V3 迁移

此扩展已从 Manifest V2 迁移到 V3，主要变化包括：

- 使用 Service Worker 替代后台页面
- 使用新的消息传递机制替代 blocking webRequest API
- 更严格的权限管理
- 改进的安全性

### 工作原理

**Chrome 扩展版**：
1. 内容脚本注入到页面中，拦截跨域请求
2. 将请求转发到扩展的 Service Worker
3. Service Worker 使用 fetch API 发起实际请求（不受 CORS 限制）
4. 将响应返回给页面

**油猴脚本版**：
1. 利用 GM_xmlhttpRequest API 直接发起跨域请求
2. 不受浏览器同源策略限制
3. 直接返回结果给页面

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
├── cross-request.user.js  # 油猴脚本版本
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
- 🎉 新增油猴脚本版本支持