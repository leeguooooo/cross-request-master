# 测试指南

本文档提供详细的测试步骤，用于验证扩展功能是否正常工作。

## 测试环境准备

1. 在 Chrome 浏览器中加载扩展（开发者模式）
2. 打开浏览器开发者工具（F12）
3. 准备测试网站

## 测试场景

### 场景 1: YApi 完整模式测试

**目标**: 验证在 YApi 网站上所有功能正常工作

**步骤**:

1. 访问 YApi 接口测试页面
2. 打开控制台，应该看到:
   ```
   [Content-Script] 完整模式：所有功能启用
   ```

3. 发送一个 GET 请求
   - 检查右上角是否显示 cURL 命令弹窗
   - 点击"复制"按钮，确认能复制命令
   - 检查请求是否成功返回

4. 测试 jQuery 拦截（如果 YApi 使用 jQuery）
   - 在控制台输入:
   ```javascript
   $.ajax({
       url: 'https://jsonplaceholder.typicode.com/posts/1',
       method: 'GET',
       success: function(data) {
           console.log('✅ jQuery 请求成功:', data);
       },
       error: function(err) {
           console.error('❌ jQuery 请求失败:', err);
       }
   });
   ```
   - 应该看到请求通过扩展发送

5. 测试禁用拦截
   ```javascript
   $.ajax({
       url: 'https://jsonplaceholder.typicode.com/posts/1',
       method: 'GET',
       crossRequest: false,  // 禁用扩展
       success: function(data) {
           console.log('✅ 原生 jQuery 请求成功:', data);
       }
   });
   ```

**预期结果**:
- ✅ cURL 弹窗显示
- ✅ 控制台有调试日志
- ✅ jQuery 请求默认被拦截
- ✅ 可以通过 `crossRequest: false` 禁用

---

### 场景 2: 非目标网站静默模式测试

**目标**: 验证在其他网站上不影响正常功能

**步骤**:

1. 访问任意普通网站（如 GitHub, Stack Overflow）
2. 打开控制台，应该看到:
   ```
   [Content-Script] 静默模式：核心功能启用，UI 和日志关闭
   ```

3. 测试手动调用
   ```javascript
   window.crossRequest({
       url: 'https://jsonplaceholder.typicode.com/posts/1',
       method: 'GET',
       success: function(res, header, data) {
           console.log('✅ 手动调用成功:', res);
       },
       error: function(err, header, data) {
           console.error('❌ 手动调用失败:', err);
       }
   });
   ```

4. 测试 jQuery 不被拦截
   ```javascript
   // 如果网站使用 jQuery
   $.ajax({
       url: 'https://jsonplaceholder.typicode.com/posts/1',
       method: 'GET',
       success: function(data) {
           console.log('✅ 原生 jQuery（不拦截）:', data);
       }
   });
   ```

5. 测试 jQuery opt-in
   ```javascript
   $.ajax({
       url: 'https://jsonplaceholder.typicode.com/posts/1',
       method: 'GET',
       crossRequest: true,  // 显式启用扩展
       success: function(data) {
           console.log('✅ 扩展处理的 jQuery 请求:', data);
       }
   });
   ```

**预期结果**:
- ✅ 没有 cURL 弹窗
- ✅ 控制台日志极少
- ✅ `window.crossRequest()` 正常工作
- ✅ jQuery 默认不被拦截
- ✅ 可以通过 `crossRequest: true` 启用拦截

---

### 场景 3: GET/HEAD 请求测试

**目标**: 验证 GET/HEAD 请求不会错误添加 body

**步骤**:

在任意网站的控制台：

```javascript
// 测试 GET 请求
window.crossRequest({
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    method: 'GET',
    data: { test: 'should-be-ignored' },  // GET 请求的 data 应该被忽略
    success: function(res) {
        console.log('✅ GET 请求成功');
    },
    error: function(err) {
        console.error('❌ GET 请求失败:', err);
    }
});

// 测试 POST 请求（对比）
window.crossRequest({
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'POST',
    data: { title: 'test', body: 'test content' },
    success: function(res) {
        console.log('✅ POST 请求成功:', res);
    }
});
```

**预期结果**:
- ✅ GET 请求成功（不应该有 "cannot have body" 错误）
- ✅ POST 请求成功发送数据

---

### 场景 4: 手动启用完整模式

**目标**: 验证用户可以手动标记网站启用完整模式

**步骤**:

1. 在任意网站的 `<head>` 中添加标记（通过控制台）:
   ```javascript
   const meta = document.createElement('meta');
   meta.name = 'cross-request-enabled';
   meta.content = 'true';
   document.head.appendChild(meta);
   ```

2. 刷新页面

3. 检查控制台，应该看到完整模式日志

**预期结果**:
- ✅ 自动切换到完整模式
- ✅ 显示 cURL 弹窗
- ✅ jQuery 默认拦截

---

## 常见问题排查

### 问题 1: cURL 弹窗不显示

**检查项**:
1. 网站是否被正确检测为目标网站？查看控制台日志
2. 是否禁用了 cURL 显示？检查扩展弹窗设置
3. 请求是否真的通过了扩展？查看 Network 标签

### 问题 2: jQuery 请求失败

**检查项**:
1. 确认网站类型（完整模式 vs 静默模式）
2. 检查是否需要设置 `crossRequest: true` 或 `false`
3. 查看控制台错误信息

### 问题 3: 手动调用超时

**检查项**:
1. 确认 URL 是否正确
2. 检查目标服务器是否可访问
3. 查看 background.js 的错误日志（扩展管理页面 → 查看背景页）

---

## 自动化测试脚本

将以下脚本保存为 `test.html`，在浏览器中打开进行快速测试：

```html
<!DOCTYPE html>
<html>
<head>
    <title>Cross Request Test</title>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body>
    <h1>Cross Request Extension Test</h1>
    <div id="results"></div>
    
    <script>
        const results = document.getElementById('results');
        
        function log(msg, status) {
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.margin = '5px';
            div.style.backgroundColor = status === 'success' ? '#d4edda' : '#f8d7da';
            div.textContent = msg;
            results.appendChild(div);
        }
        
        // Test 1: window.crossRequest
        setTimeout(() => {
            log('Test 1: window.crossRequest GET', 'info');
            window.crossRequest({
                url: 'https://jsonplaceholder.typicode.com/posts/1',
                method: 'GET',
                success: function(res) {
                    log('✅ window.crossRequest GET 成功', 'success');
                },
                error: function(err) {
                    log('❌ window.crossRequest GET 失败: ' + err, 'error');
                }
            });
        }, 1000);
        
        // Test 2: jQuery with crossRequest
        setTimeout(() => {
            if (window.$) {
                log('Test 2: jQuery with crossRequest: true', 'info');
                $.ajax({
                    url: 'https://jsonplaceholder.typicode.com/posts/2',
                    method: 'GET',
                    crossRequest: true,
                    success: function(data) {
                        log('✅ jQuery crossRequest 成功', 'success');
                    },
                    error: function(err) {
                        log('❌ jQuery crossRequest 失败', 'error');
                    }
                });
            }
        }, 2000);
        
        // Test 3: POST request
        setTimeout(() => {
            log('Test 3: window.crossRequest POST', 'info');
            window.crossRequest({
                url: 'https://jsonplaceholder.typicode.com/posts',
                method: 'POST',
                data: { title: 'test', body: 'content' },
                success: function(res) {
                    log('✅ window.crossRequest POST 成功', 'success');
                },
                error: function(err) {
                    log('❌ window.crossRequest POST 失败: ' + err, 'error');
                }
            });
        }, 3000);
    </script>
</body>
</html>
```

打开此文件后，应该看到三个测试全部通过（绿色背景）。

