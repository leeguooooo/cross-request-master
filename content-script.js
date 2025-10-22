'use strict';

// 检测是否为目标网站（YApi 或其他 API 管理平台）
function isTargetWebsite() {
  // 1. 检测 YApi 明确特征
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  const metaDescription = document.querySelector('meta[name="description"]');
  const title = document.title;

  // 优先检测 YApi 强特征
  if (metaKeywords) {
    const keywords = metaKeywords.getAttribute('content') || '';
    if (keywords.toLowerCase().includes('yapi')) {
      return true;
    }
  }

  if (metaDescription) {
    const description = metaDescription.getAttribute('content') || '';
    if (description.toLowerCase().includes('yapi')) {
      return true;
    }
  }

  if (title.toLowerCase().includes('yapi')) {
    return true;
  }

  // 2. 检测 API 管理平台特征（更严格的规则）
  if (metaKeywords) {
    const keywords = metaKeywords.getAttribute('content') || '';
    // 需要同时包含多个关键词才判定为目标网站
    if (
      (keywords.includes('api管理') || keywords.includes('接口管理')) &&
      (keywords.includes('测试') || keywords.includes('文档'))
    ) {
      return true;
    }
  }

  if (metaDescription) {
    const description = metaDescription.getAttribute('content') || '';
    if (description.includes('api管理平台') || description.includes('接口管理平台')) {
      return true;
    }
  }

  // 3. 检测 URL 特征（需要组合判断）
  const url = window.location.href;
  const hasApiPath = url.includes('/interface/') || url.includes('/project/');
  const hasApiDomain = url.includes('yapi') || url.includes('api-doc') || url.includes('apidoc');

  if (hasApiPath && hasApiDomain) {
    return true;
  }

  // 4. 检测特殊标记（给用户手动启用的选项）
  if (document.querySelector('meta[name="cross-request-enabled"]')) {
    return true;
  }

  return false;
}

console.log('[Content-Script] Content script 开始加载');

// 早期检测，如果不是目标网站，输出日志后静默退出
if (!isTargetWebsite()) {
  console.log('[Content-Script] 非目标网站，插件保持静默');
  // 不返回，但设置一个标记，让后续代码知道应该最小化运行
  window.__crossRequestSilentMode = true;
}

// 创建扩展命名空间
const CrossRequest = {
  // 配置
  config: {
    container: 'y-request',
    checkInterval: 100,
    maxRetries: 50
  },

  // 请求队列
  requestQueue: new Map(),

  // 初始化
  init() {
    const isSilent = window.__crossRequestSilentMode;

    if (isSilent) {
      console.log('[Content-Script] 静默模式：核心功能启用，UI 和日志关闭');
    } else {
      console.log('[Content-Script] 完整模式：所有功能启用');
    }

    // 静默模式下仍然需要 observeDOM 来处理手动调用
    this.observeDOM();
    this.injectScript();

    // 只有完整模式才启用 cURL 事件监听
    if (!isSilent) {
      this.initCurlEventListeners();
    }

    console.log('[Content-Script] 扩展初始化完成');
  },

  // 注入页面脚本
  injectScript() {
    // 按顺序注入：helpers -> index.js
    // 使用链式加载确保执行顺序，避免竞态条件
    const helpers = [
      'src/helpers/query-string.js',
      'src/helpers/body-parser.js',
      'src/helpers/logger.js',
      'src/helpers/response-handler.js'  // 必须在 body-parser.js 之后（有依赖）
    ];

    // 链式加载 helpers，然后加载 index.js
    let loadIndex = 0;

    const loadNextHelper = () => {
      if (loadIndex < helpers.length) {
        const helperPath = helpers[loadIndex++];
        const helperScript = document.createElement('script');
        helperScript.src = chrome.runtime.getURL(helperPath);
        helperScript.async = false; // 确保按顺序执行
        helperScript.onload = function () {
          console.log(`[Content-Script] Helper 加载成功: ${helperPath}`);
          loadNextHelper(); // 加载下一个
        };
        helperScript.onerror = function () {
          console.error(`[Content-Script] Helper 加载失败: ${helperPath}`);
          // 即使失败也继续，让 index.js 的 fallback 处理
          loadNextHelper();
        };
        (document.head || document.documentElement).appendChild(helperScript);
      } else {
        // 所有 helpers 加载完成，加载 index.js
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('index.js');
        script.async = false; // 确保在 helpers 之后执行
        script.onload = function () {
          console.log('[Content-Script] 页面脚本加载成功');
          this.remove();
        };
        script.onerror = function () {
          console.error('[Content-Script] 页面脚本加载失败');
        };
        (document.head || document.documentElement).appendChild(script);
      }
    };

    loadNextHelper(); // 开始加载
  },

  // 监听DOM变化
  observeDOM() {
    // 检查 body 是否存在
    if (!document.body) {
      console.warn('[Content-Script] document.body 不存在，延迟初始化');
      setTimeout(() => this.observeDOM(), 100);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.id && node.id.includes(this.config.container)) {
            this.handleRequestNode(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.checkExistingNodes();
  },

  // 检查现有节点
  checkExistingNodes() {
    const nodes = document.querySelectorAll(`[id*="${this.config.container}"]`);
    nodes.forEach((node) => this.handleRequestNode(node));
  },

  // 处理请求节点
  async handleRequestNode(node) {
    try {
      const requestData = this.parseRequestData(node);
      if (!requestData) return;

      console.log('[Content-Script] 处理请求:', {
        id: requestData.id,
        url: requestData.url,
        method: requestData.method
      });

      node.setAttribute('data-status', 'processing');
      const response = await this.sendRequest(requestData);
      this.handleResponse(node, response, requestData);
    } catch (error) {
      console.error('[Content-Script] 请求处理错误:', error.message);
      this.handleError(node, error);
    }
  },

  // 解析请求数据
  parseRequestData(node) {
    try {
      const data = node.textContent;
      if (!data) return null;
      const requestData = JSON.parse(decodeURIComponent(atob(data)));

      // Hack: Resolve relative URL to absolute based on current page origin
      if (requestData.url) {
        try {
          // If it's already absolute (starts with http/https), leave it
          if (!requestData.url.startsWith('http://') && !requestData.url.startsWith('https://')) {
            // Handle root-relative (e.g., '/path')
            if (requestData.url.startsWith('/')) {
              requestData.url = location.origin + requestData.url;
            } else {
              // Handle other relatives (e.g., 'path/to/endpoint')
              requestData.url = new URL(requestData.url, location.href).toString();
            }
          }
        } catch (urlError) {
          console.error('[Content-Script] URL resolution failed:', urlError);
          // Fallback: Leave as-is if resolution fails
        }
      }

      return requestData;
    } catch (e) {
      console.error('[Content-Script] 数据解析失败:', e);
      return null;
    }
  },

  // 发送请求
  sendRequest(requestData) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error('扩展上下文无效'));
        return;
      }

      try {
        chrome.runtime.sendMessage(
          {
            action: 'crossOriginRequest',
            data: requestData
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message;
              if (
                errorMessage.includes('back/forward cache') ||
                errorMessage.includes('message channel is closed')
              ) {
                console.warn('[Content-Script] 页面缓存，请求取消');
                reject(new Error('请求取消：页面缓存'));
              } else {
                reject(new Error(errorMessage));
              }
              return;
            }

            if (!response) {
              console.error('[Content-Script] 未收到响应');
              reject(new Error('未收到响应'));
            } else if (response.success) {
              console.log('[Content-Script] 请求成功:', response.data?.status);
              resolve(response.data);
            } else {
              console.error('[Content-Script] 请求失败:', response.error);
              reject(new Error(response.error || '未知错误'));
            }
          }
        );
      } catch (e) {
        reject(new Error('消息发送失败: ' + e.message));
      }
    });
  },

  // 处理响应
  handleResponse(node, response, requestData) {
    console.log('[Content-Script] 发送响应事件');

    const responseEvent = new CustomEvent('y-request-response', {
      detail: {
        id: requestData.id,
        response: {
          status: response.status || 0,
          statusText: response.statusText || 'OK',
          headers: response.headers || {},
          body: response.body || '',
          ok: response.ok !== undefined ? response.ok : true,
          url: requestData.url
        }
      }
    });

    document.dispatchEvent(responseEvent);
    console.log('[Content-Script] 响应事件已触发');
    node.remove();
  },

  // 处理错误
  handleError(node, error) {
    const requestId = node.id.replace(this.config.container + '-', '');

    console.error('[Content-Script] 发送错误事件:', error.message);

    const errorEvent = new CustomEvent('y-request-error', {
      detail: {
        id: requestId,
        error: error.message || '未知错误'
      }
    });

    document.dispatchEvent(errorEvent);
    node.remove();
  },

  // 监听 cURL 相关事件
  initCurlEventListeners() {
    console.log('[Content-Script] 开始初始化 cURL 事件监听器');

    // 监听检查禁用状态事件
    document.addEventListener('curl-check-disabled', (event) => {
      const requestData = event.detail.requestData;
      console.log('[Content-Script] 收到检查 cURL 禁用状态请求:', requestData);

      // 向 background script 查询状态
      chrome.runtime.sendMessage(
        {
          action: 'getCurlDisplayDisabled'
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              '[Content-Script] 获取 cURL 状态失败，默认显示:',
              chrome.runtime.lastError
            );
            // 失败时默认显示
            this.showCurlCommand(requestData);
            return;
          }

          if (response && response.disabled) {
            console.log('[Content-Script] cURL 显示已被永久关闭');
            return;
          }

          // 显示 cURL 弹窗
          this.showCurlCommand(requestData);
        }
      );
    });

    // 监听禁用请求事件
    document.addEventListener('curl-disable-request', (event) => {
      const disabled = event.detail.disabled;
      console.log('[Content-Script] 收到 cURL 禁用请求:', disabled);

      // 向 background script 保存设置
      chrome.runtime.sendMessage(
        {
          action: 'setCurlDisplayDisabled',
          disabled: disabled
        },
        (_response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Content-Script] 保存 cURL 禁用设置失败:', chrome.runtime.lastError);
          } else {
            console.log('[Content-Script] cURL 禁用设置已保存');
          }
        }
      );
    });

    console.log('[Content-Script] cURL 事件监听器初始化完成');
  },

  // 显示 cURL 命令弹窗
  showCurlCommand(requestData) {
    console.log('[Content-Script] 准备发送 curl-show-command 事件:', requestData);
    const event = new CustomEvent('curl-show-command', {
      detail: requestData
    });
    document.dispatchEvent(event);
    console.log('[Content-Script] curl-show-command 事件已发送');
  }
};

// 监听来自 background 的调试消息
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'debug_log') {
    console.log(`[${message.source}] ${message.message}:`, message.data);
  }
});

// 启动扩展
console.log('[Content-Script] 当前页面:', window.location.href);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Content-Script] DOM加载完成，初始化');
    CrossRequest.init();
  });
} else {
  console.log('[Content-Script] DOM已就绪，立即初始化');
  CrossRequest.init();
}

console.log('[Content-Script] Content script 加载完成');
