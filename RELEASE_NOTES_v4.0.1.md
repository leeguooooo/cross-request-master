# Release v4.0.1

## 🐛 Bug 修复

### 修复 Chrome back/forward cache 错误
- 修复了 "The page keeping the extension port is moved into back/forward cache" 错误
- 添加了全面的错误处理机制
- 改进了消息通道关闭时的处理逻辑

### 🎉 新功能
- 新增油猴脚本版本支持
- 支持 Tampermonkey、Greasemonkey 等用户脚本管理器
- 提供图形化的域名管理界面

### 📦 安装

**Chrome 扩展版本**：
1. 下载 `cross-request-v4.0.1.zip`
2. 解压到本地文件夹
3. Chrome 扩展管理页面加载解压后的文件夹

**油猴脚本版本**：
- 直接安装：https://raw.githubusercontent.com/leeguooooo/cross-request-master/main/cross-request.user.js

### 🔧 改进
- 优化了错误提示信息
- 提升了扩展的稳定性
- 改进了与页面缓存的兼容性

---

**完整更新日志**: https://github.com/leeguooooo/cross-request-master/compare/v4.0.0...v4.0.1