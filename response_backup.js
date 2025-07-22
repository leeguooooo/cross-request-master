/*==============common begin=================*/
'use strict';

(function() {
  // 创建一个唯一的命名空间，避免全局污染
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
      console.log('[Cross-Request] 开始初始化扩展');
      this.observeDOM();
      this.injectScript();
      this.listenToCurlEvents();
      console.log('[Cross-Request] 扩展初始化完成');
    },
    
    // 注入脚本到页面
    injectScript() {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('index.js');
      script.onload = function() {
        console.log('[Response] index.js 脚本已加载完成');
        this.remove();
        
        // 脚本加载完成后，通知页面
        const event = new CustomEvent('cross-request-script-loaded');
        document.dispatchEvent(event);
      };
      script.onerror = function() {
        console.error('[Response] index.js 脚本加载失败');
      };
      (document.head || document.documentElement).appendChild(script);
    },
    
    // 监听 DOM 变化
    observeDOM() {
      // 使用 MutationObserver 代替轮询
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.id && node.id.includes(this.config.container)) {
              this.handleRequestNode(node);
            }
          });
        });
      });
      
      // 开始观察
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 同时检查现有节点
      this.checkExistingNodes();
    },
    
    // 检查现有节点
    checkExistingNodes() {
      const nodes = document.querySelectorAll(`[id*="${this.config.container}"]`);
      nodes.forEach(node => this.handleRequestNode(node));
    },
    
    // 处理请求节点
    async handleRequestNode(node) {
      try {
        const requestData = this.parseRequestData(node);
        if (!requestData) return;
        
        console.log('[Response] 处理请求节点:', {
          id: requestData.id,
          url: requestData.url,
          method: requestData.method,
          hasBody: !!requestData.body
        });
        
        // 标记为处理中
        node.setAttribute('data-status', 'processing');
        
        // 发送请求到 background script
        const response = await this.sendRequest(requestData);
        
        // 处理响应
        this.handleResponse(node, response, requestData);
        
      } catch (error) {
        console.error('[Response] 处理请求出错:', {
          error: error.message,
          stack: error.stack
        });
        this.handleError(node, error);
      }
    },
    
    // 解析请求数据
    parseRequestData(node) {
      try {
        const data = node.textContent;
        if (!data) return null;
        
        return JSON.parse(decodeURIComponent(atob(data)));
      } catch (e) {
        console.error('Failed to parse request data:', e);
        return null;
      }
    },
    
    // 发送请求到 background script
    sendRequest(requestData) {
      return new Promise((resolve, reject) => {
        // 检查扩展是否仍然有效
        if (!chrome.runtime?.id) {
          reject(new Error('Extension context invalidated'));
          return;
        }
        
        try {
          chrome.runtime.sendMessage({
            action: 'crossOriginRequest',
            data: requestData
          }, (response) => {
            // 检查是否有错误
            if (chrome.runtime.lastError) {
              // 忽略 back/forward cache 错误
              const errorMessage = chrome.runtime.lastError.message;
              if (errorMessage.includes('back/forward cache') || 
                  errorMessage.includes('message channel is closed')) {
                console.warn('Page in bfcache, request cancelled');
                reject(new Error('Request cancelled: page in cache'));
              } else {
                reject(new Error(errorMessage));
              }
              return;
            }
            
            // 检查响应
            if (!response) {
              console.error('[Response] 未收到响应');
              reject(new Error('No response received'));
            } else if (response.success) {
              console.log('[Response] 收到成功响应:', {
                hasData: !!response.data,
                dataType: typeof response.data,
                status: response.data?.status,
                bodyLength: response.data?.body?.length
              });
              resolve(response.data);
            } else {
              console.error('[Response] 收到错误响应:', response.error);
              reject(new Error(response.error || 'Unknown error'));
            }
          });
        } catch (e) {
          reject(new Error('Failed to send message: ' + e.message));
        }
      });
    },
    
    // 处理响应
    handleResponse(node, response, requestData) {
      console.log('[Response] 准备发送响应事件:', {
        requestId: requestData.id,
        responseStatus: response.status,
        hasBody: !!response.body,
        bodyType: typeof response.body,
        bodyLength: response.body?.length,
        bodyPreview: response.body?.substring(0, 100)
      });
      
      // 构建响应事件
      const responseEvent = new CustomEvent('y-request-response', {
        detail: {
          id: requestData.id,
          response: {
            status: response.status || 0,
            statusText: response.statusText || 'OK',
            headers: response.headers || {},
            body: response.body || '',
            ok: response.ok !== undefined ? response.ok : true,
            // 添加 YApi 可能需要的字段
            url: requestData.url
          }
        }
      });
      
      // 触发事件
      document.dispatchEvent(responseEvent);
      console.log('[Response] 响应事件已触发');
      
      // 清理节点
      node.remove();
    },
    
    // 处理错误
    handleError(node, error) {
      const requestId = node.id.replace(this.config.container + '-', '');
      
      console.error('[Response] 处理错误，准备发送错误事件:', {
        requestId: requestId,
        error: error.message
      });
      
      const errorEvent = new CustomEvent('y-request-error', {
        detail: {
          id: requestId,
          error: error.message || 'Unknown error'
        }
      });
      
      document.dispatchEvent(errorEvent);
      
      // 清理节点
      node.remove();
    },
    
    // 监听 cURL 相关事件
    listenToCurlEvents() {
      console.log('[Response] 开始监听 cURL 事件');
      
      // 监听检查禁用状态事件
      document.addEventListener('curl-check-disabled', (event) => {
        const requestData = event.detail.requestData;
        console.log('[Response] 收到检查 cURL 禁用状态请求:', requestData);
        
        // 向 background script 查询状态
        chrome.runtime.sendMessage({
          action: 'getCurlDisplayDisabled'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Response] 获取 cURL 状态失败，默认显示:', chrome.runtime.lastError);
            // 失败时默认显示
            CrossRequest.showCurlCommand(requestData);
            return;
          }
          
          console.log('[Response] cURL 禁用状态查询结果:', response);
          
          if (response && response.disabled === true) {
            console.log('[Response] cURL 显示已被永久关闭');
            return;
          }
          
          // 显示 cURL 弹窗
          console.log('[Response] cURL 显示未被禁用，准备显示弹窗');
          CrossRequest.showCurlCommand(requestData);
        });
      });
      
      // 监听禁用请求事件
      document.addEventListener('curl-disable-request', (event) => {
        const disabled = event.detail.disabled;
        console.log('[Response] 收到 cURL 禁用请求:', disabled);
        
        // 向 background script 保存设置
        chrome.runtime.sendMessage({
          action: 'setCurlDisplayDisabled',
          disabled: disabled
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Response] 保存 cURL 禁用设置失败:', chrome.runtime.lastError);
          } else {
            console.log('[Response] cURL 禁用设置已保存');
          }
        });
      });
    },
    
    // 显示 cURL 命令弹窗
    showCurlCommand(requestData) {
      console.log('[Response] 准备发送 curl-show-command 事件:', requestData);
      
      // 直接发送事件，让页面脚本处理
      // 使用 setTimeout 确保事件在下一个事件循环中触发
      setTimeout(() => {
        const event = new CustomEvent('curl-show-command', {
          detail: requestData
        });
        document.dispatchEvent(event);
        console.log('[Response] curl-show-command 事件已发送');
      }, 0);
    }
  };
  
  // 监听来自 background 的调试消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'debug_log') {
      console.log(`[${message.source}] ${message.message}:`, message.data);
    }
  });
  
  // 启动
  console.log('[Cross-Request] Content script 已加载 - 版本 2025-01-22-v4');
  console.log('[Cross-Request] 当前页面:', window.location.href);
  
  console.log('[Cross-Request] Content script 已简化，移除历史记录功能');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Cross-Request] DOM 加载完成，开始初始化');
      CrossRequest.init();
    });
  } else {
    console.log('[Cross-Request] DOM 已就绪，立即初始化');
    CrossRequest.init();
  }
})();