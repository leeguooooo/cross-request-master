# Cross-Request 调试指南

## 问题描述
当遇到 "返回参数 data 应当是 object 类型" 错误时，通常是因为接口返回的数据格式不符合预期。本指南将帮助你定位和解决此类问题。

## 调试步骤

### 1. 打开 Chrome 开发者工具
- 按 F12 或右键选择"检查"
- 切换到 "Console" 标签页

### 2. 查看调试日志
已在代码中添加了详细的调试日志，会显示以下信息：

#### Background Script 日志（在扩展的后台页面查看）
```
[Background] 发送请求: {url, method, headers, hasBody}
[Background] 响应详情: {status, contentType, bodyLength, bodyPreview}
[Background] JSON 解析成功/失败: {dataType, isArray, keys}
```

#### Content Script 日志（在网页控制台查看）
```
[Response] 处理请求节点: {id, url, method}
[Response] 收到成功响应: {hasData, dataType, status}
[Index] 收到响应: {status, bodyLength, bodyPreview}
[Index] JSON 解析成功/失败: {dataType, isObject, keys}
```

### 3. 查看扩展后台页面日志
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 找到 Cross Request 扩展
4. 点击"背景页面"或"Service Worker"
5. 在打开的控制台中查看 [Background] 开头的日志

### 4. 常见问题排查

#### 问题1：服务器返回 HTML 而非 JSON
**症状**：
- `[Background] 响应详情` 显示 `contentType: text/html`
- `[Background] JSON 解析失败` 错误
- `bodyPreview` 显示 HTML 内容

**解决方案**：
- 检查请求的 URL 是否正确
- 确认服务器是否需要认证（登录）
- 检查请求头是否缺少必要的参数

#### 问题2：服务器返回空响应
**症状**：
- `bodyLength: 0`
- `bodyPreview: ""`

**解决方案**：
- 检查服务器端是否正确处理了请求
- 确认请求方法（GET/POST）是否正确

#### 问题3：JSON 格式错误
**症状**：
- `[Index] JSON 解析失败` 但 `contentType` 是 `application/json`
- `body` 包含非法的 JSON 字符

**解决方案**：
- 检查服务器返回的 JSON 是否有语法错误
- 注意特殊字符的转义

### 5. 数据流程追踪

1. **网页发起请求** → index.js 创建请求节点
2. **Content Script 检测** → response.js 捕获请求并发送到后台
3. **后台执行请求** → background.js 使用 fetch API
4. **返回响应** → 经过 response.js 传回网页
5. **解析数据** → index.js 尝试解析 JSON

### 6. 高级调试技巧

#### 使用断点调试
在开发者工具的 Sources 标签页中：
1. 找到相关文件（index.js、response.js）
2. 在关键位置设置断点
3. 重新发起请求，逐步调试

#### 网络请求监控
在 Network 标签页中：
1. 过滤 XHR/Fetch 请求
2. 查看实际发送的请求和响应
3. 检查请求头和响应头

#### 修改日志级别
如需更详细的日志，可以修改代码中的日志输出，例如：
- 输出完整的响应体而非预览
- 添加更多中间状态的日志

### 7. 快速定位问题
根据日志快速判断问题类型：

| 日志特征 | 可能的问题 | 解决方向 |
|---------|-----------|---------|
| contentType 不是 application/json | 服务器返回了错误的内容类型 | 检查 API 端点和认证状态 |
| JSON 解析失败 + willReturnRawString: true | 响应不是有效的 JSON | 确认 API 返回格式 |
| bodyLength: 0 | 空响应 | 检查请求参数和服务器状态 |
| 未收到响应 | 网络或扩展问题 | 检查网络连接和扩展权限 |

### 8. 提交问题报告
如果问题仍未解决，请提供以下信息：
1. 完整的控制台日志（包括 [Background]、[Response]、[Index] 日志）
2. 请求的 URL 和方法
3. 期望的响应格式
4. 实际收到的响应（从日志中的 bodyPreview）
5. 使用的浏览器版本和扩展版本