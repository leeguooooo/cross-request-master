(function (win) {
    'use strict';
    
    console.log('[Index] index.js 脚本开始执行');
    
    // 检查是否已经加载过
    if (win.__crossRequestLoaded) {
        console.log('[Cross-Request] 脚本已加载，跳过重复加载');
        return;
    }
    win.__crossRequestLoaded = true;
    console.log('[Cross-Request] 网页脚本开始加载');

    // 创建跨域请求的 API
    const CrossRequestAPI = {
        // 请求计数器
        requestId: 0,
        
        // 待处理的请求
        pendingRequests: new Map(),
        
        // 发送跨域请求
        async request(options) {
            return new Promise((resolve, reject) => {
                const id = `request-${++this.requestId}`;
                
                // 保存回调
                this.pendingRequests.set(id, { resolve, reject });
                
                // 创建请求数据
                const requestData = {
                    id,
                    url: options.url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.data || options.body,
                    timeout: options.timeout || 30000
                };
                
                // 将请求数据编码并插入到 DOM
                const container = document.createElement('div');
                container.id = `y-request-${id}`;
                container.style.display = 'none';
                container.textContent = btoa(encodeURIComponent(JSON.stringify(requestData)));
                document.body.appendChild(container);
                
                // 设置超时
                setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        const pending = this.pendingRequests.get(id);
                        const timeoutResponse = {
                            status: 0,
                            statusText: '请求超时',
                            headers: {},
                            data: { error: '请求超时' },
                            body: JSON.stringify({ error: '请求超时' }),
                            ok: false,
                            isError: true
                        };
                        pending.resolve(timeoutResponse);
                        this.pendingRequests.delete(id);
                    }
                }, requestData.timeout);
            });
        },
        
        // 处理响应
        handleResponse(event) {
            const { id, response } = event.detail;
            const pending = this.pendingRequests.get(id);
            
            if (pending) {
                // 确保 response 对象存在
                if (!response) {
                    console.error('[Index] 收到空响应');
                    pending.resolve({
                        status: 0,
                        statusText: 'No Response',
                        headers: {},
                        data: {},
                        body: ''
                    });
                    this.pendingRequests.delete(id);
                    return;
                }
                // 尝试解析 JSON，为 YApi 提供正确的数据格式
                let parsedData = response.body;
                const contentType = response.headers['content-type'] || '';
                
                if (contentType.includes('application/json') && response.body) {
                    try {
                        parsedData = JSON.parse(response.body);
                        console.log('[Index] 为 YApi 解析 JSON 成功:', {
                            originalType: typeof response.body,
                            parsedType: typeof parsedData,
                            isObject: parsedData && typeof parsedData === 'object'
                        });
                    } catch (e) {
                        console.warn('[Index] JSON 解析失败，使用原始响应:', e.message);
                        // 如果解析失败，至少确保返回一个对象格式
                        parsedData = {
                            error: 'JSON解析失败',
                            raw: response.body
                        };
                    }
                } else if (!parsedData) {
                    // 如果响应为空，返回空对象而不是 null
                    parsedData = {};
                }
                
                pending.resolve({
                    status: response.status || 0,
                    statusText: response.statusText || 'OK',  // 确保有默认值
                    headers: response.headers || {},
                    data: parsedData || {},  // 现在这里是解析后的对象，确保不为 undefined
                    body: response.body || ''  // 保留原始字符串，确保不为 undefined
                });
                this.pendingRequests.delete(id);
            }
        },
        
        // 处理错误
        handleError(event) {
            const { id, error } = event.detail;
            const pending = this.pendingRequests.get(id);
            
            if (pending) {
                pending.reject(new Error(error));
                this.pendingRequests.delete(id);
            }
        }
    };
    
    // 监听响应事件
    document.addEventListener('y-request-response', (event) => {
        CrossRequestAPI.handleResponse(event);
    });
    
    document.addEventListener('y-request-error', (event) => {
        CrossRequestAPI.handleError(event);
    });
    
    // YApi 兼容的 crossRequest 方法
    function createCrossRequestMethod() {
        return function(options) {
            console.log('[Index] YApi crossRequest 被调用:', {
                url: options.url,
                method: options.method || 'GET',
                hasSuccess: !!options.success,
                hasError: !!options.error
            });
            
            // 处理 YApi 参数格式
            if (typeof options === 'string') {
                options = { url: options };
            }
            
            // 准备请求数据
            const requestData = {
                url: options.url,
                method: options.method || options.type || 'GET',
                headers: options.headers || {},
                data: options.data || options.body,
                timeout: options.timeout || 30000
            };
            
            // 添加常见的浏览器请求头
            if (!requestData.headers['User-Agent']) {
                requestData.headers['User-Agent'] = navigator.userAgent;
            }
            
            // 如果没有指定 Content-Type 且有数据，自动添加
            if (requestData.data && !requestData.headers['Content-Type'] && !requestData.headers['content-type']) {
                if (typeof requestData.data === 'object') {
                    requestData.headers['Content-Type'] = 'application/json';
                } else {
                    requestData.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            }
            
            // 添加常见的请求头
            if (!requestData.headers['Accept']) {
                requestData.headers['Accept'] = 'application/json, text/plain, */*';
            }
            
            // 从当前页面获取可能的认证信息
            const cookies = document.cookie;
            if (cookies && !requestData.headers['Cookie']) {
                requestData.headers['Cookie'] = cookies;
            }
            
            console.log('[Index] 捕获的请求数据:', requestData);
            
            // 显示 cURL 命令
            showCurlCommand(requestData);
            
            // 发送请求
            const promise = CrossRequestAPI.request(requestData);
            
            // YApi 期望的回调格式
            promise.then(
                (response) => {
                    console.log('[Index] YApi 请求成功，调用 success 回调:', {
                        status: response.status,
                        dataType: typeof response.data,
                        isObject: response.data && typeof response.data === 'object',
                        headers: response.headers
                    });
                    
                    // 检查是否是错误响应
                    if (response.isError) {
                        // 这是一个网络错误或其他错误
                        const errorMsg = response.statusText || '请求失败';
                        createErrorDisplay(errorMsg);
                        
                        if (options.error) {
                            // 构建错误响应体
                            let errorBody;
                            try {
                                errorBody = JSON.parse(response.body);
                            } catch (e) {
                                errorBody = {
                                    data: {
                                        success: false,
                                        error: errorMsg,
                                        message: errorMsg,
                                        code: 'NETWORK_ERROR'
                                    }
                                };
                            }
                            
                            const errorHeader = response.headers || { 'content-type': 'application/json' };
                            const errorData = {
                                res: {
                                    body: response.body || JSON.stringify(errorBody),
                                    header: errorHeader,
                                    status: response.status || 0,  // 保留原始状态码，如果没有则用 0
                                    statusText: response.statusText || 'Network Error',
                                    success: false  // res 里面也需要 success
                                },
                                status: response.status || 0,  // 保留原始状态码，如果没有则用 0
                                statusText: response.statusText || 'Network Error',
                                success: false  // 顶层的 success 字段
                            };
                            
                            console.log('[Index] 处理 isError 响应，调用 error 回调:', {
                                'errorBody (第1个参数)': errorBody,
                                'errorHeader (第2个参数)': errorHeader,
                                'errorData (第3个参数)': errorData
                            });
                            
                            options.error(errorBody, errorHeader, errorData);
                            return;
                        }
                        // 如果没有错误回调，继续执行 success 回调，让 YApi 处理错误
                        console.log('[Index] 没有 error 回调，将错误传递给 success 回调');
                    }
                    
                    // 检查HTTP状态码
                    if (response.status && response.status >= 400) {
                        let errorMsg = `HTTP ${response.status}`;
                        switch(response.status) {
                            case 400:
                                errorMsg = '请求参数错误 (400)';
                                break;
                            case 401:
                                errorMsg = '未授权，请检查认证信息 (401)';
                                break;
                            case 403:
                                errorMsg = '访问被拒绝 (403)';
                                break;
                            case 404:
                                errorMsg = '请求的资源不存在 (404)';
                                break;
                            case 500:
                                errorMsg = '服务器内部错误 (500)';
                                break;
                            case 502:
                                errorMsg = '网关错误 (502)';
                                break;
                            case 503:
                                errorMsg = '服务暂时不可用 (503)';
                                break;
                        }
                        
                        // 显示错误提示
                        createErrorDisplay(errorMsg);
                    }
                    
                    if (options.success) {
                        // 根据 YApi postmanLib.js 源码，构建期望的数据结构
                        // YApi 期望第一个参数是响应内容（字符串或对象）
                        // 优先使用已经解析好的 response.data，如果不存在再使用 response.body
                        let yapiRes;
                        const contentType = response.headers['content-type'] || '';
                        
                        if (contentType.includes('application/json')) {
                            // 对于 JSON 响应，优先使用已解析的 data，确保返回对象格式
                            yapiRes = response.data;
                            
                            // 只有当 data 明确为 undefined 或 null 时才尝试重新解析 body
                            // 避免将有效的 falsy 值（如 0, false, "", {}, []）误判为需要重新解析
                            if ((yapiRes === undefined || yapiRes === null) && response.body) {
                                try {
                                    yapiRes = JSON.parse(response.body);
                                    console.log('[Index] 从 body 重新解析 JSON 成功');
                                } catch (e) {
                                    console.warn('[Index] JSON 解析失败，使用原始响应:', e.message);
                                    yapiRes = response.body;
                                }
                            }
                        } else {
                            // 对于非 JSON 响应，使用原始响应体
                            yapiRes = response.body || '';
                        }
                        
                        const yapiHeader = response.headers || {};  // 响应头
                        const yapiData = {
                            res: {
                                body: response.body || '',       // 原始响应体字符串
                                header: response.headers || {},  // 响应头
                                status: response.status || 0,    // 状态码
                                statusText: response.statusText || 'OK',
                                success: true  // 成功响应也需要 success
                            },
                            // 额外的顶层属性
                            status: response.status || 0,
                            statusText: response.statusText || 'OK',
                            success: true  // 顶层的 success 字段
                        };
                        
                        console.log('[Index] 准备调用 YApi success 回调，参数详情:', {
                            'yapiRes (第1个参数)': yapiRes,
                            'yapiRes 类型': typeof yapiRes,
                            'yapiRes 是否为对象': yapiRes && typeof yapiRes === 'object',
                            'content-type': contentType,
                            'response.data': response.data,
                            'response.body': response.body,
                            'yapiHeader (第2个参数)': yapiHeader,
                            'yapiData (第3个参数)': yapiData,
                            'status': yapiData.status,
                            'statusText': yapiData.statusText,
                            'res.status': yapiData.res.status,
                            'res.statusText': yapiData.res.statusText
                        });
                        
                        try {
                            // YApi 期望的回调参数：success(res, header, data)
                            options.success(yapiRes, yapiHeader, yapiData);
                        } catch (callbackError) {
                            console.error('[Index] YApi success 回调执行出错:', callbackError);
                            console.log('[Index] 调用堆栈:', callbackError.stack);
                            
                            // 尝试简化的格式
                            try {
                                console.log('[Index] 尝试简化格式...');
                                options.success(response.data, response.headers, response);
                            } catch (secondError) {
                                console.error('[Index] 简化格式也失败:', secondError);
                            }
                        }
                    }
                }
            ).catch((error) => {
                // 处理 promise rejection
                console.error('[Index] Promise rejected:', {
                    error: error,
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                
                // 显示错误提示
                let errorMsg = error.message || '请求失败';
                
                // 不要替换错误信息，保持 background.js 提供的详细信息
                console.log('[Index] 原始错误信息:', errorMsg);
                
                createErrorDisplay(errorMsg);
                
                if (options.error) {
                    // 与成功响应使用相同的参数结构
                    // 网络错误时没有响应体
                    const errorBody = undefined;
                    const errorHeader = {
                        'content-type': 'application/json'
                    };
                    // 使用 503 表示服务不可用
                    const errorData = {
                        res: {
                            body: errorBody,  // 空字符串，因为网络错误没有响应体
                            header: errorHeader,
                            status: 503,  // 503 Service Unavailable
                            statusText: 'Service Unavailable',
                            success: false  // res 里面也需要 success
                        },
                        status: 503,  // 503 Service Unavailable
                        statusText: 'Service Unavailable',
                        success: false  // 顶层的 success 字段
                    };
                    
                    console.log('[Index] 调用 error 回调，参数格式与成功响应一致:', {
                        'errorBody (第1个参数)': errorBody,
                        'errorHeader (第2个参数)': errorHeader,
                        'errorData (第3个参数)': errorData
                    });
                    
                    // 使用与 success 相同的三个参数
                    options.error(errorBody, errorHeader, errorData);
                } else if (options.success) {
                    // 如果没有错误回调，调用 success 回调但传递错误信息
                    // YApi 可能会检查第一个参数来判断是否有错误
                    // 网络错误时没有响应体
                    const errorBody = '';
                    const errorHeader = {
                        'content-type': 'application/json'
                    };
                    // 使用 503 表示服务不可用
                    const errorData = {
                        res: {
                            body: errorBody,  // 空字符串，因为网络错误没有响应体
                            header: errorHeader,
                            status: 503,  // 503 Service Unavailable
                            statusText: 'Service Unavailable',
                            success: false  // res 里面也需要 success
                        },
                        status: 503,  // 503 Service Unavailable
                        statusText: 'Service Unavailable',
                        success: false  // 顶层的 success 字段
                    };
                    
                    console.log('[Index] 使用 success 回调传递错误，参数:', {
                        errorBody: errorBody,
                        errorHeader: errorHeader,
                        errorData: errorData
                    });
                    
                    options.success(errorBody, errorHeader, errorData);
                }
            });
            
            return promise;
        };
    }
    
    // 复制到剪贴板的现代函数
    async function copyToClipboard(text) {
        try {
            // 优先使用现代 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
            
            // 备用方法：创建临时文本区域
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            textarea.style.top = '-999999px';
            textarea.setAttribute('readonly', '');
            document.body.appendChild(textarea);
            
            // 选择文本
            textarea.select();
            textarea.setSelectionRange(0, 99999); // 移动设备兼容
            
            // 尝试复制
            let success = false;
            try {
                // 虽然 execCommand 已废弃，但在 Clipboard API 不可用时仍然是唯一选择
                success = document.execCommand('copy');
            } catch (err) {
                console.warn('[Index] 复制命令执行失败:', err);
            }
            
            document.body.removeChild(textarea);
            return success;
        } catch (err) {
            console.error('[Index] 复制到剪贴板失败:', err);
            return false;
        }
    }

    // 生成 cURL 命令字符串
    function generateCurlCommand(url, method, headers, body) {
        let curl = `curl -X ${method}`;
        
        // 添加请求头
        if (headers && typeof headers === 'object') {
            Object.entries(headers).forEach(([key, value]) => {
                // 过滤掉空值和过长的值（如 User-Agent）
                if (value && value.trim && value.trim() !== '' && value.length < 200) {
                    curl += ` \\\n  -H "${key}: ${value}"`;
                }
            });
        }
        
        // 添加请求体（只有非 GET 请求且有数据时才添加）
        if (body && (method !== 'GET' && method !== 'DELETE')) {
            // 如果 body 是对象，转换为 JSON 字符串
            let bodyStr = body;
            if (typeof body === 'object') {
                bodyStr = JSON.stringify(body);
            }
            curl += ` \\\n  -d '${bodyStr}'`;
        }
        
        // 添加 URL（放在最后）
        curl += ` \\\n  "${url}"`;
        
        return curl;
    }

    // 创建错误提示框
    function createErrorDisplay(errorMessage) {
        // 移除已存在的错误提示
        const existingError = document.getElementById('cross-request-error-display');
        if (existingError) {
            existingError.remove();
        }
        
        const errorDisplay = document.createElement('div');
        errorDisplay.id = 'cross-request-error-display';
        errorDisplay.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 300px;
            max-width: 500px;
            background: #f56565;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            z-index: 10001;
            animation: slideDown 0.3s ease-out;
        `;
        
        errorDisplay.innerHTML = `
            <div style="padding: 16px; display: flex; align-items: center; gap: 12px;">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7v4a1 1 0 102 0V7a1 1 0 10-2 0zm0 8a1 1 0 102 0 1 1 0 00-2 0z" fill="currentColor"/>
                </svg>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">请求失败</div>
                    <div style="opacity: 0.9; font-size: 13px; white-space: pre-line;">${errorMessage}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: transparent; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; opacity: 0.7; hover:opacity: 1;">×</button>
            </div>
        `;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translate(-50%, -20px);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, 0);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(errorDisplay);
        
        // 5秒后自动隐藏
        setTimeout(() => {
            errorDisplay.style.opacity = '0';
            errorDisplay.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => errorDisplay.remove(), 300);
        }, 5000);
    }

    // 自动隐藏定时器
    let curlHideTimer = null;
    
    // 创建页面内的 cURL 显示框
    function createCurlDisplay() {
        // 检查是否已经存在
        const existingDisplay = document.getElementById('cross-request-curl-display');
        if (existingDisplay) {
            // 重新绑定事件监听器，防止事件丢失
            bindCurlDisplayEvents();
            return existingDisplay;
        }
        
        const curlDisplay = document.createElement('div');
        curlDisplay.id = 'cross-request-curl-display';
        curlDisplay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: 300px;
            background: #2d3748;
            color: #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            z-index: 10000;
            display: none;
            overflow: hidden;
            opacity: 1;
            transition: opacity 0.3s ease-out;
        `;
        
        curlDisplay.innerHTML = `
            <div style="padding: 12px; background: #4a5568; border-bottom: 1px solid #718096; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: #68d391;">cURL 命令</span>
                <div>
                    <button id="curl-copy-btn" style="background: #48bb78; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 4px; font-size: 11px;">复制</button>
                    <button id="curl-disable-btn" style="background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 4px; font-size: 11px;">永久关闭</button>
                    <button id="curl-close-btn" style="background: #f56565; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">×</button>
                </div>
            </div>
            <pre id="curl-command-text" style="margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 200px; line-height: 1.4;"></pre>
        `;
        
        document.body.appendChild(curlDisplay);
        
        // 绑定事件
        bindCurlDisplayEvents();
        
        return curlDisplay;
    }
    
    // 绑定 cURL 显示框事件（防止事件丢失）
    function bindCurlDisplayEvents() {
        const copyBtn = document.getElementById('curl-copy-btn');
        const closeBtn = document.getElementById('curl-close-btn');
        const disableBtn = document.getElementById('curl-disable-btn');
        
        if (!copyBtn || !closeBtn || !disableBtn) {
            console.warn('[Index] cURL 显示框按钮元素未找到');
            return;
        }
        
        // 清除旧的事件监听器（如果存在）
        copyBtn.onclick = null;
        closeBtn.onclick = null;
        disableBtn.onclick = null;
        
        // 重新绑定事件
        copyBtn.addEventListener('click', async () => {
            const curlText = document.getElementById('curl-command-text').textContent;
            
            console.log('[Index] 复制按钮被点击');
            // 使用现代复制方法
            const success = await copyToClipboard(curlText);
            if (success) {
                copyBtn.textContent = '已复制';
                setTimeout(() => {
                    copyBtn.textContent = '复制';
                }, 2000);
            } else {
                copyBtn.textContent = '复制失败';
                setTimeout(() => {
                    copyBtn.textContent = '复制';
                }, 2000);
            }
        });
        
        closeBtn.addEventListener('click', () => {
            console.log('[Index] 关闭按钮被点击');
            hideCurlDisplay();
        });
        
        disableBtn.addEventListener('click', () => {
            console.log('[Index] 永久关闭按钮被点击');
            // 通过 DOM 事件发送消息给 content script
            const event = new CustomEvent('curl-disable-request', {
                detail: { disabled: true }
            });
            document.dispatchEvent(event);
            hideCurlDisplay();
        });
        
        console.log('[Index] cURL 显示框事件已重新绑定');
    }
    
    // 隐藏 cURL 显示框
    function hideCurlDisplay() {
        const curlDisplay = document.getElementById('cross-request-curl-display');
        if (curlDisplay) {
            // 清除现有定时器
            if (curlHideTimer) {
                clearTimeout(curlHideTimer);
                curlHideTimer = null;
            }
            
            // 淡出动画
            curlDisplay.style.opacity = '0';
            setTimeout(() => {
                curlDisplay.style.display = 'none';
                curlDisplay.style.opacity = '1'; // 重置透明度，为下次显示做准备
            }, 300);
        }
    }
    
    // 设置自动隐藏定时器
    function setAutoHideTimer() {
        // 清除现有定时器
        if (curlHideTimer) {
            clearTimeout(curlHideTimer);
        }
        
        // 设置新的3秒定时器
        curlHideTimer = setTimeout(() => {
            hideCurlDisplay();
            curlHideTimer = null;
        }, 3000);
    }

    // 显示 cURL 命令
    function showCurlCommand(requestData) {
        // 检查是否已被永久关闭
        console.log('[Index] 准备检查 cURL 禁用状态，发送事件:', requestData);
        const event = new CustomEvent('curl-check-disabled', {
            detail: { requestData: requestData }
        });
        document.dispatchEvent(event);
        console.log('[Index] curl-check-disabled 事件已发送');
    }

    // 显示 cURL 弹窗（由 content script 调用）
    function displayCurlCommand(requestData) {
        console.log('[Index] displayCurlCommand 被调用，参数:', requestData);
        
        const curlDisplay = createCurlDisplay();
        if (!curlDisplay) {
            console.error('[Index] 创建 cURL 显示框失败');
            return;
        }
        console.log('[Index] cURL 显示框已创建/获取');
        
        const curlCommand = generateCurlCommand(
            requestData.url,
            requestData.method,
            requestData.headers,
            requestData.data || requestData.body
        );
        console.log('[Index] cURL 命令已生成:', curlCommand);
        
        const curlText = document.getElementById('curl-command-text');
        if (!curlText) {
            console.error('[Index] 找不到 curl-command-text 元素');
            return;
        }
        
        // 更新内容并显示
        curlText.textContent = curlCommand;
        curlDisplay.style.display = 'block';
        curlDisplay.style.opacity = '1'; // 确保透明度正确
        
        console.log('[Index] cURL 显示框样式已更新:', {
            display: curlDisplay.style.display,
            opacity: curlDisplay.style.opacity,
            visibility: window.getComputedStyle(curlDisplay).visibility
        });
        
        // 确保事件监听器已绑定
        setTimeout(() => {
            bindCurlDisplayEvents();
        }, 100);
        
        // 设置自动隐藏定时器
        setAutoHideTimer();
        
        console.log('[Index] cURL 弹窗显示完成');
    }
    
    // 监听来自 content script 的响应事件
    document.addEventListener('curl-show-command', (event) => {
        const requestData = event.detail;
        console.log('[Index] 收到 curl-show-command 事件:', requestData);
        displayCurlCommand(requestData);
    });
    
    // 添加调试：确认事件监听器已注册
    console.log('[Index] curl-show-command 事件监听器已注册');

    // 创建兼容的 jQuery ajax 方法
    function createAjaxMethod() {
        return function(options) {
            // 处理 jQuery ajax 的参数格式
            if (typeof options === 'string') {
                options = { url: options };
            }
            
            // 准备请求数据
            const requestData = {
                url: options.url,
                method: options.type || options.method || 'GET',
                headers: options.headers || {},
                data: options.data,
                timeout: options.timeout
            };
            
            // 添加常见的浏览器请求头
            if (!requestData.headers['User-Agent']) {
                requestData.headers['User-Agent'] = navigator.userAgent;
            }
            
            // 如果没有指定 Content-Type 且有数据，自动添加
            if (requestData.data && !requestData.headers['Content-Type'] && !requestData.headers['content-type']) {
                if (typeof requestData.data === 'object') {
                    requestData.headers['Content-Type'] = 'application/json';
                } else {
                    requestData.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            }
            
            // 添加常见的请求头
            if (!requestData.headers['Accept']) {
                requestData.headers['Accept'] = 'application/json, text/plain, */*';
            }
            
            // 从当前页面获取可能的认证信息
            const cookies = document.cookie;
            if (cookies && !requestData.headers['Cookie']) {
                requestData.headers['Cookie'] = cookies;
            }
            
            console.log('[Index] 捕获的请求数据:', requestData);
            
            // 显示 cURL 命令
            showCurlCommand(requestData);
            
            // 转换 jQuery 的 success/error 回调为 Promise
            const promise = CrossRequestAPI.request(requestData);
            
            // 支持 jQuery 风格的回调
            if (options.success || options.error || options.complete) {
                promise.then(
                    (response) => {
                        console.log('[Index] 收到响应:', {
                            url: options.url,
                            status: response.status,
                            dataPropertyType: typeof response.data,
                            bodyPropertyType: typeof response.body,
                            bodyLength: response.body ? response.body.length : 0,
                            bodyPreview: response.body ? response.body.substring(0, 100) : 'empty'
                        });
                        
                        if (options.success) {
                            // response.data 现在已经是解析后的对象了
                            console.log('[Index] 传递给 success 回调:', {
                                dataType: typeof response.data,
                                isArray: Array.isArray(response.data),
                                isObject: response.data && typeof response.data === 'object',
                                keys: response.data && typeof response.data === 'object' && !Array.isArray(response.data) ? Object.keys(response.data).slice(0, 5) : []
                            });
                            options.success(response.data, 'success', response);
                        }
                        if (options.complete) {
                            options.complete(response, 'success');
                        }
                    },
                    (error) => {
                        if (options.error) {
                            options.error({ statusText: error.message }, 'error', error.message);
                        }
                        if (options.complete) {
                            options.complete({ statusText: error.message }, 'error');
                        }
                    }
                );
            }
            
            // 返回 Promise 以支持现代用法
            return promise;
        };
    }
    
    // 暴露 API
    // YApi 直接调用 window.crossRequest(options)
    win.crossRequest = createCrossRequestMethod();
    
    // 同时保持向后兼容
    win.crossRequest.fetch = CrossRequestAPI.request.bind(CrossRequestAPI);
    win.crossRequest.ajax = createAjaxMethod();
    
    console.log('[Cross-Request] API 已暴露到 window.crossRequest');
    
    // 如果存在 jQuery，扩展它
    if (win.$ && win.$.ajax) {
        const originalAjax = win.$.ajax;
        win.$.ajax = function(options) {
            // 检查是否需要使用跨域请求
            if (options && options.crossRequest !== false) {
                return win.crossRequest.ajax(options);
            }
            return originalAjax.apply(this, arguments);
        };
    }
    
    // 创建标记，表示脚本已加载
    const sign = document.createElement('div');
    sign.id = 'cross-request-loaded';
    sign.style.display = 'none';
    document.body.appendChild(sign);
    
    console.log('[Index] index.js 脚本执行完成，所有功能已注册');
    
})(window);