# Cross Request Master

[![GitHub Sponsors](https://img.shields.io/github/sponsors/leeguooooo?logo=github)](https://github.com/sponsors/leeguooooo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-brightgreen.svg)](https://chrome.google.com/webstore)

专为 YApi 接口管理平台定制的 Chrome 扩展，支持绕过 CORS 限制并自动生成 cURL 命令。

![cURL 生成效果](./images/curl-generation-demo-new.png)

## 目录

- [功能特性](#功能特性)
- [安装](#安装)
- [快速开始](#快速开始)
- [高级用法](#高级用法)
- [工作原理](#工作原理)
- [安全说明](#安全说明)
- [开发指南](#开发指南)
- [贡献](#贡献)
- [支持项目](#支持项目)
- [许可证](#许可证)

## 功能特性

- **跨域请求支持** - 绕过浏览器 CORS 限制，直接测试跨域接口
- **cURL 命令生成** - 自动生成完整 cURL 命令，一键复制分享
- **智能网站检测** - 自动识别 YApi 等 API 管理平台，按需激活功能
- **jQuery 集成** - 智能拦截 jQuery ajax 请求，无需修改现有代码
- **Manifest V3** - 基于最新 Chrome 扩展标准开发

## 安装

1. 下载或克隆本仓库到本地
   ```bash
   git clone https://github.com/leeguooooo/cross-request-master.git
   ```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 开启右上角的"开发者模式"

4. 点击"加载已解压的扩展程序"，选择项目目录

## 快速开始

### 在 YApi 中使用

安装后在 YApi 接口页面正常发送请求，扩展会自动：
- 处理跨域请求
- 在页面右上角显示 cURL 命令
- 点击"复制"按钮即可分享

### 在其他网页中使用

在任意网页的控制台或脚本中调用：

```javascript
window.crossRequest({
    url: 'https://api.example.com/data',
    method: 'GET',
    headers: {
        'Authorization': 'Bearer token'
    },
    success: function(res, header, data) {
        console.log('Success:', res);
    },
    error: function(err, header, data) {
        console.error('Error:', err);
    }
});
```

## 高级用法

### jQuery 集成

扩展根据网站类型自动采用不同的拦截策略：

**YApi 等目标网站（自动检测）**

默认拦截所有 jQuery ajax 请求。如需禁用：

```javascript
$.ajax({
    url: 'https://api.example.com/data',
    method: 'GET',
    crossRequest: false,  // 禁用扩展，使用原生 ajax
    success: function(data) {
        console.log(data);
    }
});
```

**其他网站**

默认不拦截，需显式启用：

```javascript
$.ajax({
    url: 'https://api.example.com/data',
    method: 'GET',
    crossRequest: true,  // 启用扩展处理
    success: function(data) {
        console.log(data);
    }
});
```

### 手动启用完整模式

在页面 HTML 中添加 meta 标签强制启用：

```html
<meta name="cross-request-enabled">
```

## 工作原理

### 智能检测

扩展会根据以下特征自动识别目标网站：
- Meta 标签包含 "yapi"、"api管理"、"接口管理"
- 页面标题包含 "yapi"
- URL 路径和域名组合匹配（如 `/interface/` + `yapi` 域名）

### 运行模式

**完整模式**（YApi 等目标网站）
- 启用 DOM 监听和请求处理
- 显示 cURL 命令弹窗
- jQuery 默认拦截
- 输出调试日志

**静默模式**（其他网站）
- 启用核心 API（支持手动调用）
- 隐藏 UI 和日志
- jQuery opt-in 拦截

### 技术架构

- **Content Script** - 注入到网页，监听和拦截请求
- **Background Service Worker** - 处理实际的跨域请求
- **Message Passing** - Chrome Runtime API 进行通信

## 安全说明

> **警告**: 本扩展仅供开发测试使用，请勿在生产环境使用。

- 扩展默认允许所有域名的跨域请求
- 不要在银行、支付等敏感网站启用
- 请求会被扩展拦截和处理，可能影响网站正常功能
- 使用时请遵守目标 API 的使用条款和安全政策

## 开发指南

### 项目结构

```
cross-request-master/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker
├── content-script.js      # Content Script
├── index.js              # 注入脚本
├── popup.html/js         # 扩展弹窗
└── icons/                # 图标资源
```

### 本地开发

1. 修改代码后，在 `chrome://extensions/` 点击"重新加载"
2. 打开浏览器控制台查看日志
3. 在 YApi 测试页面验证功能

### 测试

详细测试步骤请参考 [TESTING.md](./TESTING.md)

快速检查项：
- YApi 网站：cURL 弹窗显示 + 控制台有日志
- 普通网站：无 UI 弹窗 + 手动调用正常工作

### 技术栈

- Chrome Extension Manifest V3
- Service Worker
- Content Scripts
- Vanilla JavaScript

## 贡献

欢迎提交 Issue 和 Pull Request！

提交问题时请提供：
1. Chrome 版本和扩展版本
2. 详细的错误信息和复现步骤
3. 预期行为和实际行为

## 支持项目

如果本项目对你有帮助，欢迎通过以下方式支持：

- ⭐ Star 本仓库
- 🐛 [提交 Issue](https://github.com/leeguooooo/cross-request-master/issues) 反馈问题
- 💻 [提交 PR](https://github.com/leeguooooo/cross-request-master/pulls) 贡献代码
- 💖 [赞助开发](https://github.com/sponsors/leeguooooo) 通过 GitHub Sponsors

### 微信 / 支付宝赞助

如果你想通过微信或支付宝支持本项目：

<div align="center">
  <p><i>添加赞助二维码请联系项目维护者</i></p>
</div>

你的支持是项目持续维护和改进的动力！ 🙏

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解详细的版本更新历史。

**最新版本 v4.4.11** (2025-10-17)
- 优化网站检测规则，减少误报
- 新增手动启用选项
- 完善测试文档

## 许可证

[MIT License](LICENSE)

## 相关链接

- [GitHub Issues](https://github.com/leeguooooo/cross-request-master/issues)
- [Chrome Extension 开发文档](https://developer.chrome.com/docs/extensions/)
- [YApi 官网](https://github.com/YMFE/yapi)

---

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=leeguooooo/cross-request-master&type=Date)](https://www.star-history.com/#leeguooooo/cross-request-master&Date)

Made with ❤️ by [leeguooooo](https://github.com/leeguooooo)

</div>
