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
            
            // 发送请求
            const promise = CrossRequestAPI.request({
                url: options.url,
                method: options.method || options.type || 'GET',
                headers: options.headers || {},
                data: options.data || options.body,
                timeout: options.timeout || 30000
            });
            
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
    
    // 创建兼容的 jQuery ajax 方法
    function createAjaxMethod() {
        return function(options) {
            // 处理 jQuery ajax 的参数格式
            if (typeof options === 'string') {
                options = { url: options };
            }
            
            // 转换 jQuery 的 success/error 回调为 Promise
            const promise = CrossRequestAPI.request({
                url: options.url,
                method: options.type || options.method || 'GET',
                headers: options.headers || {},
                data: options.data,
                timeout: options.timeout
            });
            
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