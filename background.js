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
    console.log('[Background] 发送请求:', {
      url,
      method,
      headers: Object.fromEntries(fetchOptions.headers.entries()),
      hasBody: !!fetchOptions.body
    });
    
    // 将日志也发送到所有标签页，方便在网页控制台查看
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'debug_log',
            source: 'Background',
            message: '发送请求',
            data: { url, method, hasBody: !!fetchOptions.body }
          }).catch(() => {}); // 忽略错误
        }
      });
    });
    
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // 获取响应头
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // 获取响应体
    const responseBody = await response.text();
    
    // 添加调试日志
    console.log('[Background] 响应详情:', {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: responseHeaders['content-type'] || 'unknown',
      bodyLength: responseBody.length,
      bodyPreview: responseBody.substring(0, 200)
    });
    
    // 同样发送到网页控制台
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'debug_log',
            source: 'Background',
            message: '响应详情',
            data: {
              url,
              status: response.status,
              contentType: responseHeaders['content-type'] || 'unknown',
              bodyLength: responseBody.length,
              bodyPreview: responseBody.substring(0, 200)
            }
          }).catch(() => {});
        }
      });
    });
    
    // 尝试解析 JSON 以验证格式
    let parsedBody = null;
    let isJson = false;
    if (responseHeaders['content-type']?.includes('application/json')) {
      try {
        parsedBody = JSON.parse(responseBody);
        isJson = true;
        console.log('[Background] JSON 解析成功:', {
          dataType: typeof parsedBody,
          isArray: Array.isArray(parsedBody),
          keys: parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody).slice(0, 10) : []
        });
      } catch (e) {
        console.error('[Background] JSON 解析失败:', e.message);
        console.log('[Background] 原始响应体:', responseBody);
      }
    }
    
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
  console.log('[Background] 收到消息:', {
    action: request.action,
    fromTab: !!sender?.tab,
    fromPopup: !sender?.tab && !!sender,
    sender: sender
  });
  
  // 对于跨域请求，需要检查发送者是否来自标签页
  if (request.action === 'crossOriginRequest' && (!sender || !sender.tab)) {
    console.warn('Cross-origin request from invalid sender');
    return false;
  }

  if (request.action === 'crossOriginRequest') {
    handleCrossOriginRequest(request.data)
      .then(response => {
        // 检查是否仍然可以发送响应
        try {
          sendResponse({ success: true, data: response });
        } catch (e) {
          console.warn('Failed to send response, port might be closed:', e);
        }
      })
      .catch(error => {
        try {
          sendResponse({ success: false, error: error.message });
        } catch (e) {
          console.warn('Failed to send error response, port might be closed:', e);
        }
      });
    
    // 返回 true 表示异步响应
    return true;
  }
  
  // 处理白名单管理
  if (request.action === 'getAllowedDomains') {
    console.log('[Background] 处理 getAllowedDomains 请求');
    const domainsArray = Array.from(allowedDomains);
    console.log('[Background] 当前域名列表:', domainsArray);
    
    try {
      sendResponse({ domains: domainsArray });
      console.log('[Background] 域名列表已发送');
    } catch (e) {
      console.warn('[Background] 发送域名列表失败:', e);
    }
    return false; // 同步响应
  }
  
  if (request.action === 'setAllowedDomains') {
    console.log('[Background] 处理 setAllowedDomains 请求:', request.domains);
    
    chrome.storage.local.set({ allowedDomains: request.domains }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 保存域名失败:', chrome.runtime.lastError);
        try {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } catch (e) {
          console.warn('[Background] 发送错误响应失败:', e);
        }
        return;
      }
      
      console.log('[Background] 域名保存成功');
      try {
        sendResponse({ success: true });
      } catch (e) {
        console.warn('[Background] 发送成功响应失败:', e);
      }
    });
    return true;
  }
  
  // 处理重新加载域名列表的请求
  if (request.action === 'reloadAllowedDomains') {
    console.log('[Background] 重新加载域名列表');
    chrome.storage.local.get(['allowedDomains'], (result) => {
      if (result.allowedDomains) {
        allowedDomains = new Set(result.allowedDomains);
        console.log('[Background] 域名列表已更新:', Array.from(allowedDomains));
      }
    });
    return false;
  }
  
  return false;
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
const keepAlive = () => {
  const interval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      if (chrome.runtime.lastError) {
        clearInterval(interval);
      }
    });
  }, 20e3);
  return interval;
};

chrome.runtime.onStartup.addListener(keepAlive);
chrome.runtime.onInstalled.addListener(keepAlive);

// 立即启动保活
keepAlive();

// 添加更强的保活机制
chrome.runtime.onMessage.addListener(() => {
  // 每次收到消息都重新保活
  keepAlive();
});

console.log('[Background] Service Worker 已启动');