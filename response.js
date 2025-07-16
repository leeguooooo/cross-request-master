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
      this.listenToRequestHistory();
      console.log('[Cross-Request] 扩展初始化完成');
    },
    
    // 注入脚本到页面
    injectScript() {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('index.js');
      script.onload = function() {
        this.remove();
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
    
    // 监听请求历史记录事件
    listenToRequestHistory() {
      console.log('[Response] 开始监听请求历史记录事件');
      
      document.addEventListener('y-request-history', (event) => {
        const historyItem = event.detail;
        console.log('[Response] 收到请求历史记录:', historyItem);
        
        try {
          // 获取当前的请求历史
          chrome.storage.local.get(['requestHistory'], (result) => {
            if (chrome.runtime.lastError) {
              console.error('[Response] 获取请求历史失败:', chrome.runtime.lastError);
              return;
            }
            
            const history = result.requestHistory || [];
            
            // 添加到历史记录开头（最新的在前面）
            history.unshift(historyItem);
            
            // 只保留最近的 50 条记录
            if (history.length > 50) {
              history.splice(50);
            }
            
            // 保存到存储
            chrome.storage.local.set({ requestHistory: history }, () => {
              if (chrome.runtime.lastError) {
                console.error('[Response] 保存请求历史失败:', chrome.runtime.lastError);
              } else {
                console.log('[Response] 请求已保存到历史记录:', historyItem);
              }
            });
          });
        } catch (error) {
          console.error('[Response] 处理请求历史时出错:', error);
        }
      });
      
      // 定期同步 localStorage 到 Chrome 存储
      setInterval(() => {
        try {
          const localHistory = JSON.parse(localStorage.getItem('crossRequestHistory') || '[]');
          if (localHistory.length > 0) {
            console.log('[Response] 同步 localStorage 到 Chrome 存储:', localHistory.length, '条记录');
            
            chrome.storage.local.get(['requestHistory'], (result) => {
              if (chrome.runtime.lastError) {
                console.error('[Response] 获取现有历史失败:', chrome.runtime.lastError);
                return;
              }
              
              const chromeHistory = result.requestHistory || [];
              
              // 合并历史记录，去重
              const allHistory = [...chromeHistory, ...localHistory];
              const uniqueHistory = [];
              const seen = new Set();
              
              allHistory.forEach(item => {
                const key = `${item.url}_${item.method}_${item.timestamp}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  uniqueHistory.push(item);
                }
              });
              
              // 按时间戳排序（最新的在前面）
              uniqueHistory.sort((a, b) => b.timestamp - a.timestamp);
              
              // 只保留最近的 50 条记录
              if (uniqueHistory.length > 50) {
                uniqueHistory.splice(50);
              }
              
              // 保存到 Chrome 存储
              chrome.storage.local.set({ requestHistory: uniqueHistory }, () => {
                if (chrome.runtime.lastError) {
                  console.error('[Response] 同步保存失败:', chrome.runtime.lastError);
                } else {
                  console.log('[Response] 历史记录已同步:', uniqueHistory.length, '条');
                  // 清空 localStorage
                  localStorage.removeItem('crossRequestHistory');
                }
              });
            });
          }
        } catch (error) {
          console.error('[Response] 同步 localStorage 时出错:', error);
        }
      }, 5000); // 每 5 秒同步一次
    }
  };
  
  // 监听来自 background 的调试消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'debug_log') {
      console.log(`[${message.source}] ${message.message}:`, message.data);
    }
  });
  
  // 启动
  console.log('[Cross-Request] Content script 已加载 - 版本 2025-01-15-v2');
  console.log('[Cross-Request] 当前页面:', window.location.href);
  
  // 立即开始监听请求历史记录事件，不等待 DOM 完全加载
  console.log('[Cross-Request] 准备调用 listenToRequestHistory');
  CrossRequest.listenToRequestHistory();
  console.log('[Cross-Request] listenToRequestHistory 调用完成');
  
  // 定期同步 localStorage 到 Chrome 存储
  setInterval(() => {
    try {
      const localHistory = JSON.parse(localStorage.getItem('crossRequestHistory') || '[]');
      if (localHistory.length > 0) {
        console.log('[Cross-Request] 同步 localStorage 到 Chrome 存储:', localHistory.length, '条记录');
        
        chrome.storage.local.get(['requestHistory'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[Cross-Request] 获取现有历史失败:', chrome.runtime.lastError);
            return;
          }
          
          const chromeHistory = result.requestHistory || [];
          
          // 合并历史记录，去重
          const allHistory = [...chromeHistory, ...localHistory];
          const uniqueHistory = [];
          const seen = new Set();
          
          allHistory.forEach(item => {
            const key = `${item.url}_${item.method}_${item.timestamp}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueHistory.push(item);
            }
          });
          
          // 按时间戳排序（最新的在前面）
          uniqueHistory.sort((a, b) => b.timestamp - a.timestamp);
          
          // 只保留最近的 50 条记录
          if (uniqueHistory.length > 50) {
            uniqueHistory.splice(50);
          }
          
          // 保存到 Chrome 存储
          chrome.storage.local.set({ requestHistory: uniqueHistory }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Cross-Request] 同步保存失败:', chrome.runtime.lastError);
            } else {
              console.log('[Cross-Request] 历史记录已同步:', uniqueHistory.length, '条');
              // 清空 localStorage
              localStorage.removeItem('crossRequestHistory');
            }
          });
        });
      }
    } catch (error) {
      console.error('[Cross-Request] 同步 localStorage 时出错:', error);
    }
  }, 3000); // 每 3 秒同步一次
  
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