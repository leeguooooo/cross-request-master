'use strict';

(function() {
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
      console.log('[Cross-Request] 扩展初始化开始');
      this.observeDOM();
      this.injectScript();
      this.listenToCurlEvents();
      console.log('[Cross-Request] 扩展初始化完成');
    },
    
    // 注入页面脚本
    injectScript() {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('index.js');
      script.onload = function() {
        console.log('[Response] 页面脚本加载成功');
        this.remove();
      };
      script.onerror = function() {
        console.error('[Response] 页面脚本加载失败');
      };
      (document.head || document.documentElement).appendChild(script);
    },
    
    // 监听DOM变化
    observeDOM() {
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
      nodes.forEach(node => this.handleRequestNode(node));
    },
    
    // 处理请求节点
    async handleRequestNode(node) {
      try {
        const requestData = this.parseRequestData(node);
        if (!requestData) return;
        
        console.log('[Response] 处理请求:', {
          id: requestData.id,
          url: requestData.url,
          method: requestData.method
        });
        
        node.setAttribute('data-status', 'processing');
        const response = await this.sendRequest(requestData);
        this.handleResponse(node, response, requestData);
        
      } catch (error) {
        console.error('[Response] 请求处理错误:', error.message);
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
        console.error('[Response] 数据解析失败:', e);
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
          chrome.runtime.sendMessage({
            action: 'crossOriginRequest',
            data: requestData
          }, (response) => {
            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message;
              if (errorMessage.includes('back/forward cache') || 
                  errorMessage.includes('message channel is closed')) {
                console.warn('[Response] 页面缓存，请求取消');
                reject(new Error('请求取消：页面缓存'));
              } else {
                reject(new Error(errorMessage));
              }
              return;
            }
            
            if (!response) {
              console.error('[Response] 未收到响应');
              reject(new Error('未收到响应'));
            } else if (response.success) {
              console.log('[Response] 请求成功:', response.data?.status);
              resolve(response.data);
            } else {
              console.error('[Response] 请求失败:', response.error);
              reject(new Error(response.error || '未知错误'));
            }
          });
        } catch (e) {
          reject(new Error('消息发送失败: ' + e.message));
        }
      });
    },
    
    // 处理响应
    handleResponse(node, response, requestData) {
      console.log('[Response] 发送响应事件');
      
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
      console.log('[Response] 响应事件已触发');
      node.remove();
    },
    
    // 处理错误
    handleError(node, error) {
      const requestId = node.id.replace(this.config.container + '-', '');
      
      console.error('[Response] 发送错误事件:', error.message);
      
      const errorEvent = new CustomEvent('y-request-error', {
        detail: {
          id: requestId,
          error: error.message || '未知错误'
        }
      });
      
      document.dispatchEvent(errorEvent);
      node.remove();
    },
    
    // 监听cURL相关事件
    listenToCurlEvents() {
      console.log('[Response] 监听cURL事件');
      
      document.addEventListener('curl-check-disabled', (event) => {
        const requestData = event.detail.requestData;
        console.log('[Response] 检查cURL显示状态');
        
        chrome.runtime.sendMessage({
          action: 'getCurlDisplayDisabled'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Response] 获取状态失败，默认显示');
            CrossRequest.showCurlCommand(requestData);
            return;
          }
          
          console.log('[Response] cURL状态查询结果:', response);
          
          if (response && response.disabled === true) {
            console.log('[Response] cURL显示已禁用');
            return;
          }
          
          console.log('[Response] 显示cURL弹窗');
          CrossRequest.showCurlCommand(requestData);
        });
      });
      
      document.addEventListener('curl-disable-request', (event) => {
        const disabled = event.detail.disabled;
        console.log('[Response] 设置cURL禁用状态:', disabled);
        
        chrome.runtime.sendMessage({
          action: 'setCurlDisplayDisabled',
          disabled: disabled
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Response] 设置保存失败');
          } else {
            console.log('[Response] cURL设置已保存');
          }
        });
      });
    },
    
    // 显示cURL命令
    showCurlCommand(requestData) {
      console.log('[Response] 发送显示命令事件');
      
      setTimeout(() => {
        const event = new CustomEvent('curl-show-command', {
          detail: requestData
        });
        document.dispatchEvent(event);
        console.log('[Response] 显示命令事件已发送');
      }, 0);
    }
  };
  
  // 监听background消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'debug_log') {
      console.log(`[${message.source}] ${message.message}:`, message.data);
    }
  });
  
  // 启动扩展
  console.log('[Cross-Request] Content script 已加载 - 重命名版本 v1.0');
  console.log('[Cross-Request] 当前页面:', window.location.href);
  
  // 拦截所有可能的 localStorage 错误
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const message = args[0];
    if (typeof message === 'string' && message.includes('localStorage')) {
      console.trace('[Cross-Request] 拦截到 localStorage 错误，堆栈追踪:');
      console.log('[Cross-Request] 错误来源分析:', {
        message: message,
        arguments: args,
        caller: arguments.callee.caller?.name || 'unknown',
        stack: new Error().stack
      });
    }
    originalConsoleError.apply(console, args);
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Cross-Request] DOM加载完成，初始化');
      CrossRequest.init();
    });
  } else {
    console.log('[Cross-Request] DOM已就绪，立即初始化');
    CrossRequest.init();
  }
})();