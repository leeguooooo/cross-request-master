(function (win) {
    'use strict';
    
    // 检查是否已经加载过
    if (!document.getElementById('cross-request-sign') || win.__crossRequestLoaded) {
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
                        this.pendingRequests.get(id).reject(new Error('Request timeout'));
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
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    data: parsedData,  // 现在这里是解析后的对象
                    body: response.body  // 保留原始字符串
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
            
            // 保存请求到历史记录
            saveRequestToHistory(requestData);
            
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
                    
                    if (options.success) {
                        // 根据 YApi 源码，构建期望的数据结构
                        const yapiRes = response.data;  // 实际的响应数据
                        const yapiHeader = response.headers;  // 响应头
                        const yapiData = {
                            res: {
                                body: response.body,      // 原始响应体字符串
                                header: response.headers, // 响应头
                                status: response.status   // 状态码
                            },
                            // 可能还需要其他字段
                            status: response.status,
                            statusText: response.statusText
                        };
                        
                        console.log('[Index] 准备调用 YApi success 回调，参数详情:', {
                            'yapiRes (第1个参数)': yapiRes,
                            'yapiHeader (第2个参数)': yapiHeader,
                            'yapiData (第3个参数)': yapiData
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
                },
                (error) => {
                    console.error('[Index] YApi 请求失败:', error.message);
                    
                    if (options.error) {
                        options.error(error, 'error', error.message);
                    } else if (options.success) {
                        // 如果没有错误回调，也调用 success 但传递错误信息
                        options.success({ 
                            status: 0, 
                            statusText: error.message,
                            ok: false 
                        }, {}, { error: error.message });
                    }
                }
            );
            
            return promise;
        };
    }
    
    // 复制到剪贴板的兼容函数
    function copyToClipboard(text) {
        // 尝试使用现代 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('[Index] Clipboard API 失败，使用降级方法:', err);
            }
        }
        
        // 降级方法：使用 execCommand
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            textarea.style.top = '-999999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            const result = document.execCommand('copy');
            document.body.removeChild(textarea);
            return result;
        } catch (err) {
            console.error('[Index] 复制失败:', err);
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

    // 创建页面内的 cURL 显示框
    function createCurlDisplay() {
        // 检查是否已经存在
        if (document.getElementById('cross-request-curl-display')) {
            return;
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
        `;
        
        curlDisplay.innerHTML = `
            <div style="padding: 12px; background: #4a5568; border-bottom: 1px solid #718096; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: #68d391;">cURL 命令</span>
                <div>
                    <button id="curl-copy-btn" style="background: #48bb78; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 8px; font-size: 11px;">复制</button>
                    <button id="curl-close-btn" style="background: #f56565; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">×</button>
                </div>
            </div>
            <pre id="curl-command-text" style="margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 200px; line-height: 1.4;"></pre>
        `;
        
        document.body.appendChild(curlDisplay);
        
        // 绑定事件
        document.getElementById('curl-copy-btn').addEventListener('click', () => {
            const curlText = document.getElementById('curl-command-text').textContent;
            const copyBtn = document.getElementById('curl-copy-btn');
            
            // 使用降级复制方法
            if (copyToClipboard(curlText)) {
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
        
        document.getElementById('curl-close-btn').addEventListener('click', () => {
            curlDisplay.style.display = 'none';
        });
        
        // 5秒后自动隐藏
        setTimeout(() => {
            curlDisplay.style.display = 'none';
        }, 5000);
    }

    // 显示 cURL 命令
    function showCurlCommand(requestData) {
        createCurlDisplay();
        
        const curlCommand = generateCurlCommand(
            requestData.url,
            requestData.method,
            requestData.headers,
            requestData.data || requestData.body
        );
        
        const curlDisplay = document.getElementById('cross-request-curl-display');
        const curlText = document.getElementById('curl-command-text');
        
        curlText.textContent = curlCommand;
        curlDisplay.style.display = 'block';
        
        console.log('[Index] 显示 cURL 命令:', curlCommand);
    }

    // 保存请求到历史记录
    function saveRequestToHistory(requestData) {
        try {
            // 创建历史记录项
            const historyItem = {
                url: requestData.url,
                method: requestData.method,
                headers: requestData.headers,
                body: requestData.data || requestData.body, // 统一使用 data 字段
                timestamp: Date.now()
            };
            
            console.log('[Index] 准备保存请求到历史记录:', historyItem);
            
            // 显示 cURL 命令
            showCurlCommand(requestData);
            
            // 首先尝试通过 DOM 事件将请求数据传递给 content script
            const event = new CustomEvent('y-request-history', {
                detail: historyItem
            });
            console.log('[Index] 发送请求历史事件:', event);
            document.dispatchEvent(event);
            console.log('[Index] 请求历史事件已发送');
            
            // 同时保存到 localStorage 作为备用
            try {
                const existingHistory = JSON.parse(localStorage.getItem('crossRequestHistory') || '[]');
                existingHistory.unshift(historyItem);
                
                // 只保留最近的 50 条记录
                if (existingHistory.length > 50) {
                    existingHistory.splice(50);
                }
                
                localStorage.setItem('crossRequestHistory', JSON.stringify(existingHistory));
                console.log('[Index] 请求已保存到 localStorage:', historyItem);
            } catch (localStorageError) {
                console.warn('[Index] 保存到 localStorage 失败:', localStorageError);
            }
            
        } catch (error) {
            console.error('[Index] 保存请求历史时出错:', error);
        }
    }

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
            
            // 保存请求到历史记录
            saveRequestToHistory(requestData);
            
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
    
})(window);