(function (win) {
    'use strict';
    
    // 检查是否已经加载过
    if (!document.getElementById('cross-request-sign') || win.__crossRequestLoaded) {
        return;
    }
    win.__crossRequestLoaded = true;

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
                pending.resolve({
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    data: response.body,
                    body: response.body
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
                        if (options.success) {
                            try {
                                // 尝试解析 JSON
                                const jsonData = JSON.parse(response.body);
                                options.success(jsonData, 'success', response);
                            } catch (e) {
                                options.success(response.body, 'success', response);
                            }
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
    win.crossRequest = {
        fetch: CrossRequestAPI.request.bind(CrossRequestAPI),
        ajax: createAjaxMethod()
    };
    
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