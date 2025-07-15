# Cross-Request v4.0.2 发布说明

## 🚀 主要更新

### 修复的问题
1. **修复 YApi 兼容性问题**
   - 解决了 "返回参数 data 应当是 object 类型" 错误
   - 改进了与 YApi 的接口对接，确保响应数据格式正确

2. **修复 Popup 页面问题**
   - 解决了域名白名单显示 "加载中..." 无法加载的问题
   - 修复了 Service Worker 消息端口关闭导致的保存失败问题

3. **增强的调试功能**
   - 添加了详细的调试日志，便于问题排查
   - 改进了错误提示信息

### 技术改进
1. **API 兼容性**
   - 完全兼容 YApi 的 `window.crossRequest(options)` 调用方式
   - 支持正确的回调参数格式：`success(res, header, data)`
   - 自动解析 JSON 响应，确保 `data` 参数始终为对象类型

2. **Service Worker 优化**
   - 改进了 Manifest V3 下的 Service Worker 保活机制
   - 优化了消息传递的可靠性
   - Popup 页面现在直接使用存储 API，避免消息传递问题

3. **错误处理**
   - 更好的错误处理和用户反馈
   - 增强的网络请求容错机制

## 📦 安装方式

### Chrome 扩展安装
1. 下载 `cross-request-v4.0.2.zip`
2. 解压到本地文件夹
3. 打开 Chrome 浏览器，进入 `chrome://extensions/`
4. 开启 "开发者模式"
5. 点击 "加载已解压的扩展程序"
6. 选择解压后的文件夹

### 验证安装
- 扩展安装成功后，在 YApi 中发送 API 请求应该不再出现 "返回参数 data 应当是 object 类型" 错误
- 点击扩展图标可以正常管理域名白名单

## 🐛 问题排查

如果遇到问题，请：
1. 按 F12 打开开发者工具查看控制台日志
2. 查看是否有 `[Cross-Request]`、`[Background]`、`[Response]`、`[Index]` 开头的日志
3. 在 GitHub Issues 中报告问题时请提供相关日志

## 🔄 从旧版本升级

如果你之前安装过 cross-request 扩展：
1. 先在 `chrome://extensions/` 中移除旧版本
2. 按照上述步骤安装新版本
3. 重新配置域名白名单（如果需要）

---

**版本**: v4.0.2  
**发布日期**: 2025-07-15  
**兼容性**: Chrome 88+, Manifest V3