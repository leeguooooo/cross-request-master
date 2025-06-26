# Release v4.0.0

## 🎉 重大更新：迁移到 Manifest V3

这是一个重大版本更新，将扩展从 Manifest V2 迁移到了 V3，以符合 Chrome 的最新标准。

### ✨ 新功能

- **域名白名单管理** - 新增可视化界面管理允许的跨域请求域名
- **更好的安全性** - 默认需要手动添加信任的域名，不再默认允许所有请求
- **现代化代码** - 使用 ES6+ 语法重写，提高代码质量和性能

### 🔄 重要变更

- 从 Manifest V2 迁移到 V3
- 使用 Service Worker 替代后台页面
- 移除了不安全的请求头修改功能
- 使用新的消息传递机制替代 blocking webRequest API

### 🛡️ 安全改进

- 添加域名白名单功能，限制可访问的域名
- 清晰的安全警告提示
- 最小化权限要求

### 🐛 修复

- 修复了内存泄漏问题
- 优化了 DOM 监听性能（使用 MutationObserver）
- 改进了错误处理机制

### 📦 安装

1. 下载 `cross-request-v4.0.0.zip`
2. 解压到本地文件夹
3. 打开 Chrome 扩展管理页面 (chrome://extensions/)
4. 开启开发者模式
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

### ⚠️ 注意事项

- 需要 Chrome 88+ 版本
- 仅供开发测试使用，请勿在生产环境使用
- 首次使用需要配置允许的域名

### 📝 使用示例

```javascript
// 使用 crossRequest.ajax (jQuery 风格)
crossRequest.ajax({
  url: 'https://api.example.com/data',
  method: 'POST',
  data: { key: 'value' },
  success: function(data) {
    console.log('Success:', data);
  }
});

// 使用 crossRequest.fetch (Promise 风格)
crossRequest.fetch({
  url: 'https://api.example.com/data',
  method: 'GET'
}).then(response => {
  console.log('Response:', response);
});
```

### 🙏 致谢

感谢所有贡献者和用户的支持！

---

**完整更新日志**: https://github.com/leeguooooo/cross-request-master/compare/v3.1...v4.0.0