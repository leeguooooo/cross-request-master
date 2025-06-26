'use strict';

// 域名白名单管理
let allowedDomains = new Set(['*']); // 默认允许所有域名，后续可以限制

// 初始化白名单
chrome.storage.local.get(['allowedDomains'], (result) => {
  if (result.allowedDomains) {
    allowedDomains = new Set(result.allowedDomains);
  }
});

// 监听白名单更新
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.allowedDomains) {
    allowedDomains = new Set(changes.allowedDomains.newValue || ['*']);
  }
});

// 检查域名是否在白名单中
function isDomainAllowed(url) {
  if (allowedDomains.has('*')) {
    return true;
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // 检查完全匹配或通配符匹配
    for (const domain of allowedDomains) {
      if (domain === hostname) {
        return true;
      }
      // 支持通配符子域名，如 *.example.com
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

// 处理跨域请求
async function handleCrossOriginRequest(request) {
  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = request;
  
  // 检查域名白名单
  if (!isDomainAllowed(url)) {
    throw new Error('Domain not allowed: ' + url);
  }
  
  // 构建请求选项
  const fetchOptions = {
    method,
    headers: new Headers(headers),
    mode: 'cors',
    credentials: 'include',
  };
  
  // 添加请求体（如果有）
  if (body && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'object' && !(body instanceof FormData)) {
      fetchOptions.body = JSON.stringify(body);
      if (!fetchOptions.headers.has('Content-Type')) {
        fetchOptions.headers.set('Content-Type', 'application/json');
      }
    } else {
      fetchOptions.body = body;
    }
  }
  
  // 使用 AbortController 实现超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetchOptions.signal = controller.signal;
  
  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // 获取响应头
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // 获取响应体
    const responseBody = await response.text();
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      ok: response.ok
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout after ' + timeout + 'ms');
    }
    throw error;
  }
}

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'crossOriginRequest') {
    handleCrossOriginRequest(request.data)
      .then(response => {
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    // 返回 true 表示异步响应
    return true;
  }
  
  // 处理白名单管理
  if (request.action === 'getAllowedDomains') {
    sendResponse({ domains: Array.from(allowedDomains) });
    return true;
  }
  
  if (request.action === 'setAllowedDomains') {
    chrome.storage.local.set({ allowedDomains: request.domains }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// 处理扩展安装或更新
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装时设置默认配置
    chrome.storage.local.set({
      allowedDomains: ['*'],
      settings: {
        enableLogging: false,
        maxTimeout: 60000
      }
    });
  } else if (details.reason === 'update') {
    // 处理版本更新
    console.log('Extension updated from', details.previousVersion, 'to', chrome.runtime.getManifest().version);
  }
});

// Service Worker 保活（Manifest V3 需要）
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();