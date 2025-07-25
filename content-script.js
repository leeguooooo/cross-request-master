'use strict';

console.log('[Content-Script] Content script 开始加载');

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
    console.log('[Content-Script] 开始初始化扩展');
    this.observeDOM();
    this.injectScript();
    this.initCurlEventListeners();
    console.log('[Content-Script] 扩展初始化完成');
  },
  
  // 注入页面脚本
  injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('index.js');
    script.onload = function() {
      console.log('[Content-Script] 页面脚本加载成功');
      this.remove();
    };
    script.onerror = function() {
      console.error('[Content-Script] 页面脚本加载失败');
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
      return JSON.parse(decodeURIComponent(atob(data)));
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
        chrome.runtime.sendMessage({
          action: 'crossOriginRequest',
          data: requestData
        }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMessage = chrome.runtime.lastError.message;
            if (errorMessage.includes('back/forward cache') || 
                errorMessage.includes('message channel is closed')) {
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
        });
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
      chrome.runtime.sendMessage({
        action: 'getCurlDisplayDisabled'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Content-Script] 获取 cURL 状态失败，默认显示:', chrome.runtime.lastError);
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
      });
    });
    
    // 监听禁用请求事件
    document.addEventListener('curl-disable-request', (event) => {
      const disabled = event.detail.disabled;
      console.log('[Content-Script] 收到 cURL 禁用请求:', disabled);
      
      // 向 background script 保存设置
      chrome.runtime.sendMessage({
        action: 'setCurlDisplayDisabled',
        disabled: disabled
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Content-Script] 保存 cURL 禁用设置失败:', chrome.runtime.lastError);
        } else {
          console.log('[Content-Script] cURL 禁用设置已保存');
        }
      });
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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