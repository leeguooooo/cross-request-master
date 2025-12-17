# Cross Request Master

[![GitHub Sponsors](https://img.shields.io/github/sponsors/leeguooooo?logo=github)](https://github.com/sponsors/leeguooooo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-brightgreen.svg)](https://chrome.google.com/webstore/detail/efgjanhcajpiljllnehiinpmicghbgfm)

专为 YApi/接口管理平台定制的 Chrome 扩展：绕过 CORS 发请求、自动生成 cURL，并兼容 YApi 的 request/response 脚本与 jQuery ajax。

<img width="2950" height="1048" alt="CleanShot 2025-12-17 at 18 37 24@2x" src="https://github.com/user-attachments/assets/5103c830-767c-45fa-9bbb-46fbda752fa1" />
<img width="2966" height="1882" alt="CleanShot 2025-12-17 at 18 39 44@2x" src="https://github.com/user-attachments/assets/46906250-4a02-4136-b081-3b44d4ce3b44" />


## 功能特性

- 跨域请求：在页面侧调用 `crossRequest` 由扩展后台代发
- cURL 生成：自动展示可复制的 cURL 命令
- 智能静默模式：非目标网站不弹窗、不刷日志，但仍可手动调用
- jQuery 集成：按站点类型自动/按需拦截 `$.ajax`
- 文件上传：支持 `multipart/form-data` / FormData（含 File/Blob）
- Manifest V3：兼容最新 Chrome 扩展标准

## 安装

**Chrome Web Store（推荐）**  
https://chrome.google.com/webstore/detail/efgjanhcajpiljllnehiinpmicghbgfm

**开发者模式**  
```bash
git clone https://github.com/leeguooooo/cross-request-master.git
cd cross-request-master
./build-extension.sh
```
然后在 `chrome://extensions/` 开启开发者模式 → “加载已解压的扩展程序” → 选择 `build/`。

## 使用

### 在 YApi 中

安装后直接在 YApi 页面发送请求即可，扩展会自动处理跨域、显示 cURL，并把 JSON 响应解析为对象供脚本使用。

在接口详情页（基本信息区域右上角）额外提供：
- **所有项目 MCP 配置**：全局模式（账号密码登录），只需配置一次，后续可自动缓存所有项目 token（生成配置默认使用 `@leeguoo/yapi-mcp`）
- **当前项目 MCP 配置**：项目 token 模式（自动拼好 `projectId:token`），适合单项目/少量项目
- **复制当前页面给 AI**：把当前接口信息整理成 Markdown（仅接口相关字段）复制到剪贴板

### YApi OpenAPI（Yapi-MCP tool 同名方法）

扩展在页面侧额外暴露 `window.crossRequest.yapiMcp`（也可用 `window.crossRequest.yapi`），把 YApi OpenAPI 封装成与 Yapi-MCP 一致的 5 个方法，方便直接在浏览器控制台/脚本里操作接口文档：

```js
// 先配置（支持多项目：'28:token1,29:token2'）
window.crossRequest.yapiMcp.configure({
  baseUrl: 'https://your-yapi-domain.com',
  token: '28:your_project_token'
});

// 查接口、拉分类、搜索、保存
const api = await window.crossRequest.yapiMcp.yapi_get_api_desc({ projectId: '28', apiId: '66' });
```

### 在任意网页中手动调用

```js
window.crossRequest({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: { Authorization: 'Bearer token' },
  success(res) {
    console.log('Success:', res);
  },
  error(err) {
    console.error('Error:', err);
  }
});
```

`crossRequest` 也会返回 Promise：

```js
const resp = await window.crossRequest({ url: '/api/ping' });
console.log(resp.status, resp.data);
```

### jQuery 集成

- **YApi/目标站点**：默认拦截所有 `$.ajax`。如需关闭：`crossRequest: false`
- **其他站点**：默认不拦截。需显式开启：`crossRequest: true`

```js
$.ajax({
  url: 'https://api.example.com/data',
  method: 'GET',
  crossRequest: true
});
```

### 文件上传（FormData）

```js
const fd = new FormData();
fd.append('file', fileInput.files[0]);
fd.append('name', 'demo');

await window.crossRequest({
  url: 'https://api.example.com/upload',
  method: 'POST',
  body: fd
});
```

## TypeScript 类型定义

仓库内置 `types/cross-request.d.ts`，可直接复制到你的项目并在 `tsconfig.json` 中 include，或在 `global.d.ts` 引用：

```ts
/// <reference path="./types/cross-request.d.ts" />
```

## 已知限制 / FAQ

- **自定义 Header 被放到 `Access-Control-Request-Headers`**：这是浏览器 CORS 预检行为，需要服务端正确返回 `Access-Control-Allow-Headers`。
- **Network 面板看不到请求**：请求由扩展后台发出，不会出现在页面 Network；可在扩展 Service Worker 的 Network/Console 查看。

## 开发与测试

项目结构：
```
manifest.json        MV3 配置
background.js        Service Worker
content-script.js    注入/通信
index.js             页面侧 API 与适配器
src/helpers/         可复用 helper
tests/               Jest 单测
```

常用命令：
```bash
pnpm install
pnpm test
pnpm lint
pnpm format
./build-extension.sh
```

## 贡献与支持

- 提交 Issue/PR 前请先看 `CONTRIBUTING.md`
- 如果项目对你有帮助，欢迎 Star 或赞助：
  - GitHub Sponsors: https://github.com/sponsors/leeguooooo
  - 微信/支付宝赞赏码见下方

### 赞助开发

如果你觉得这个项目对你有帮助，可以请作者喝杯咖啡：

**GitHub Sponsors**

[![GitHub Sponsors](https://img.shields.io/github/sponsors/leeguooooo?style=for-the-badge&logo=github)](https://github.com/sponsors/leeguooooo)

**微信 / 支付宝**

<div align="center">
  <img src=".github/wechatpay.JPG" alt="微信赞赏码" width="300"/>
  <img src=".github/alipay.JPG" alt="支付宝收款码" width="300"/>
</div>

## 更新日志

见 `CHANGELOG.md`，最新版本：v4.5.7。

## 许可证

[MIT License](https://opensource.org/licenses/MIT)

## 相关链接

- Issues: https://github.com/leeguooooo/cross-request-master/issues
- YApi: https://github.com/YMFE/yapi
- Yapi-MCP: https://github.com/lzsheng/Yapi-MCP
- YApi OpenAPI 文档: https://hellosean1025.github.io/yapi/openapi.html
- Chrome Extension Docs: https://developer.chrome.com/docs/extensions/

## 更多文档

- 测试指南：`docs/TESTING.md`
- 技术路线图：`docs/ROADMAP.md`
- 商店提交指南：`docs/STORE_SUBMISSION_GUIDE.md`
- 提交检查清单：`docs/CHROME_WEB_STORE_CHECKLIST.md`
