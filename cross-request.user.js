// ==UserScript==
// @name         Cross Request - 跨域请求工具
// @namespace    https://github.com/leeguooooo/cross-request-master
// @version      4.0.1
// @description  支持跨域请求的油猴脚本，兼容 jQuery Ajax 和 Fetch API
// @author       leeguooooo
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      *
// @license      MIT
// @homepage     https://github.com/leeguooooo/cross-request-master
// @supportURL   https://github.com/leeguooooo/cross-request-master/issues
// @updateURL    https://raw.githubusercontent.com/leeguooooo/cross-request-master/main/cross-request.user.js
// @downloadURL  https://raw.githubusercontent.com/leeguooooo/cross-request-master/main/cross-request.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 获取允许的域名列表
    let allowedDomains = GM_getValue('allowedDomains', ['*']);

    // 检查域名是否允许
    function isDomainAllowed(url) {
        if (allowedDomains.includes('*')) {
            return true;
        }

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            for (const domain of allowedDomains) {
                if (domain === hostname) {
                    return true;
                }
                // 支持通配符子域名
                if (domain.startsWith('*.')) {
                    const baseDomain = domain.substring(2);
                    if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
                        return true;
                    }
                }
            }
        } catch (e) {
            console.error('Invalid URL:', url);
            return false;
        }

        return false;
    }

    // 跨域请求实现
    function crossOriginRequest(options) {
        return new Promise((resolve, reject) => {
            const { url, method = 'GET', headers = {}, data, timeout = 30000 } = options;

            // 检查域名白名单
            if (!isDomainAllowed(url)) {
                reject(new Error('Domain not allowed: ' + url));
                return;
            }

            // 准备请求参数
            const gmOptions = {
                method: method,
                url: url,
                headers: headers,
                timeout: timeout,
                onload: function(response) {
                    // 解析响应头
                    const responseHeaders = {};
                    if (response.responseHeaders) {
                        response.responseHeaders.split('\n').forEach(header => {
                            const [key, value] = header.split(':');
                            if (key && value) {
                                responseHeaders[key.trim()] = value.trim();
                            }
                        });
                    }

                    resolve({
                        status: response.status,
                        statusText: response.statusText,
                        headers: responseHeaders,
                        body: response.responseText,
                        data: response.responseText
                    });
                },
                onerror: function(error) {
                    reject(new Error('Request failed: ' + error));
                },
                ontimeout: function() {
                    reject(new Error('Request timeout after ' + timeout + 'ms'));
                }
            };

            // 处理请求体
            if (data) {
                if (typeof data === 'object' && !(data instanceof FormData)) {
                    gmOptions.data = JSON.stringify(data);
                    if (!headers['Content-Type']) {
                        gmOptions.headers['Content-Type'] = 'application/json';
                    }
                } else {
                    gmOptions.data = data;
                }
            }

            // 发送请求
            GM_xmlhttpRequest(gmOptions);
        });
    }

    // 创建兼容的 jQuery ajax 方法
    function createAjaxMethod() {
        return function(options) {
            if (typeof options === 'string') {
                options = { url: options };
            }

            const promise = crossOriginRequest({
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

            return promise;
        };
    }

    // 暴露全局 API
    window.crossRequest = {
        fetch: crossOriginRequest,
        ajax: createAjaxMethod(),
        // 管理域名白名单
        getAllowedDomains: () => allowedDomains,
        setAllowedDomains: (domains) => {
            allowedDomains = domains;
            GM_setValue('allowedDomains', domains);
        },
        addDomain: (domain) => {
            if (!allowedDomains.includes(domain)) {
                allowedDomains.push(domain);
                GM_setValue('allowedDomains', allowedDomains);
            }
        },
        removeDomain: (domain) => {
            allowedDomains = allowedDomains.filter(d => d !== domain);
            GM_setValue('allowedDomains', allowedDomains);
        }
    };

    // 创建管理界面
    function createConfigUI() {
        const div = document.createElement('div');
        div.id = 'cross-request-config';
        div.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: white; padding: 20px; border-radius: 8px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 999999; 
                        width: 400px; max-height: 500px; overflow-y: auto;">
                <h3 style="margin: 0 0 15px 0;">Cross Request 域名管理</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center;">
                        <input type="checkbox" id="cr-allow-all" style="margin-right: 8px;">
                        允许所有域名（不推荐）
                    </label>
                </div>
                <div id="cr-domain-list" style="border: 1px solid #ddd; border-radius: 4px; 
                            padding: 10px; margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <input type="text" id="cr-new-domain" placeholder="输入域名，如: *.example.com" 
                           style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <button id="cr-add-btn" style="padding: 8px 16px; background: #4a90e2; 
                            color: white; border: none; border-radius: 4px; cursor: pointer;">添加</button>
                </div>
                <div style="text-align: right;">
                    <button id="cr-close-btn" style="padding: 8px 16px; background: #666; 
                            color: white; border: none; border-radius: 4px; cursor: pointer;">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        // 更新域名列表显示
        function updateDomainList() {
            const list = document.getElementById('cr-domain-list');
            const filtered = allowedDomains.filter(d => d !== '*');
            
            if (filtered.length === 0) {
                list.innerHTML = '<div style="color: #666;">暂无特定域名限制</div>';
            } else {
                list.innerHTML = filtered.map(domain => `
                    <div style="display: flex; justify-content: space-between; align-items: center; 
                                padding: 5px 0;">
                        <span style="font-family: monospace;">${domain}</span>
                        <button data-domain="${domain}" class="cr-delete-btn" 
                                style="padding: 4px 8px; background: #dc3545; color: white; 
                                       border: none; border-radius: 4px; cursor: pointer; 
                                       font-size: 12px;">删除</button>
                    </div>
                `).join('');
            }
        }

        // 初始化
        updateDomainList();
        document.getElementById('cr-allow-all').checked = allowedDomains.includes('*');

        // 事件处理
        document.getElementById('cr-allow-all').addEventListener('change', (e) => {
            if (e.target.checked) {
                window.crossRequest.setAllowedDomains(['*']);
            } else {
                window.crossRequest.setAllowedDomains([]);
            }
            updateDomainList();
        });

        document.getElementById('cr-add-btn').addEventListener('click', () => {
            const input = document.getElementById('cr-new-domain');
            const domain = input.value.trim();
            if (domain) {
                window.crossRequest.addDomain(domain);
                input.value = '';
                updateDomainList();
            }
        });

        document.getElementById('cr-domain-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('cr-delete-btn')) {
                const domain = e.target.dataset.domain;
                window.crossRequest.removeDomain(domain);
                updateDomainList();
            }
        });

        document.getElementById('cr-close-btn').addEventListener('click', () => {
            div.remove();
        });
    }

    // 注册菜单命令
    GM_registerMenuCommand('管理跨域域名', createConfigUI);

    // 添加提示
    console.log(
        '%c Cross Request 已加载 %c 点击油猴菜单"管理跨域域名"进行配置 ',
        'background: #4a90e2; color: white; padding: 2px 5px; border-radius: 3px;',
        'color: #4a90e2;'
    );

    // 如果存在 jQuery，扩展它
    if (window.$ && window.$.ajax) {
        const originalAjax = window.$.ajax;
        window.$.ajax = function(options) {
            // 检查是否需要使用跨域请求
            if (options && options.crossRequest !== false) {
                return window.crossRequest.ajax(options);
            }
            return originalAjax.apply(this, arguments);
        };
    }
})();