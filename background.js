'use strict';

let safeLogResponse = null;

try {
  /* global importScripts */
  importScripts('src/helpers/logger.js');
  if (self.CrossRequestHelpers && self.CrossRequestHelpers.safeLogResponse) {
    safeLogResponse = self.CrossRequestHelpers.safeLogResponse;
  }
} catch (helperError) {
  console.warn('[Background] safeLogResponse helper 加载失败:', helperError);
}

if (!safeLogResponse) {
  safeLogResponse = function (originalBody, options) {
    const opts = options || {};
    const maxBytes = typeof opts.maxBytes === 'number' ? opts.maxBytes : 10 * 1024;
    const headChars = typeof opts.headChars === 'number' ? opts.headChars : 512;
    const tailChars = typeof opts.tailChars === 'number' ? opts.tailChars : 512;

    function toText(value) {
      if (value == null) {
        return '';
      }
      if (typeof value === 'string') {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value);
      }
    }

    const text = toText(originalBody);
    let byteLength;
    if (typeof TextEncoder !== 'undefined') {
      byteLength = new TextEncoder().encode(text).length;
    } else {
      byteLength = text.length * 2;
    }

    if (byteLength <= maxBytes) {
      return originalBody;
    }

    return {
      truncated: true,
      size: byteLength + ' bytes',
      head: text.slice(0, headChars),
      tail: tailChars > 0 ? text.slice(-tailChars) : '',
      hint: '响应体过大，已截断显示'
    };
  };
}

// 域名白名单管理
let allowedDomains = new Set(['*']); // 默认允许所有域名，后续可以限制

// 初始化白名单 - 强制使用允许所有域名
chrome.storage.local.get(['allowedDomains'], (_result) => {
  // 忽略存储的值，始终使用 ['*']
  allowedDomains = new Set(['*']);
});

// 监听白名单更新 - 强制使用允许所有域名
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.allowedDomains) {
    // 忽略更新，始终使用 ['*']
    allowedDomains = new Set(['*']);
  }
});

// 检查域名是否在白名单中
function isDomainAllowed(_url) {
  // 强制允许所有域名
  return true;

  /* 以下是原有逻辑（已禁用）
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
  */
}

// 获取标准的 HTTP 状态文本
function getStatusText(status) {
  const statusTexts = {
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };

  return statusTexts[status] || 'Unknown Status';
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
    credentials: 'include'
  };

  // 添加请求体（如果有）
  if (body && method.toLowerCase() !== 'get' && method.toLowerCase() !== 'head') {
    if (typeof body === 'object' && !(body instanceof FormData)) {
      // 检查 Content-Type 以决定如何序列化 body
      const contentType = fetchOptions.headers.get('Content-Type') || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        // 对于 form-urlencoded，使用 URLSearchParams
        fetchOptions.body = new URLSearchParams(body).toString();
      } else {
        // 默认使用 JSON
        fetchOptions.body = JSON.stringify(body);
        if (!fetchOptions.headers.has('Content-Type')) {
          fetchOptions.headers.set('Content-Type', 'application/json');
        }
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
      tabs.forEach((tab) => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'debug_log',
              source: 'Background',
              message: '发送请求',
              data: { url, method, hasBody: !!fetchOptions.body }
            })
            .catch(() => {}); // 忽略错误
        }
      });
    });

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (fetchError) {
      // 捕获 fetch 的网络错误
      console.error('[Background] Fetch 失败:', fetchError);

      // 判断错误类型
      if (fetchError.message.includes('net::ERR_CONNECTION_REFUSED')) {
        throw new Error(
          `无法连接到服务器 ${url}\n请确认：\n1. 服务器是否已启动\n2. 端口是否正确\n3. 防火墙设置`
        );
      } else if (fetchError.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        throw new Error(`无法解析域名 ${url}\n请检查域名是否正确`);
      } else if (fetchError.message.includes('net::ERR_INTERNET_DISCONNECTED')) {
        throw new Error('网络连接已断开，请检查网络设置');
      } else if (fetchError.message.includes('net::ERR_TIMED_OUT')) {
        throw new Error(`连接超时 ${url}\n服务器响应太慢或网络不稳定`);
      }

      // 重新抛出原始错误
      throw fetchError;
    }
    clearTimeout(timeoutId);

    // 获取响应头
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // 获取响应体
    const responseBody = await response.text();

    // 添加调试日志
    const safePreview = safeLogResponse(responseBody);

    console.log('[Background] 响应详情:', {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: responseHeaders['content-type'] || 'unknown',
      bodyLength: responseBody.length,
      bodyPreview: safePreview
    });

    // 同样发送到网页控制台
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'debug_log',
              source: 'Background',
              message: '响应详情',
              data: {
                url,
                status: response.status,
                contentType: responseHeaders['content-type'] || 'unknown',
                bodyLength: responseBody.length,
                bodyPreview: safePreview
              }
            })
            .catch(() => {});
        }
      });
    });

    const contentType = responseHeaders['content-type'] || '';
    let parsedBody;
    let hasParsedBody = false;

    if (contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(responseBody);
        hasParsedBody = true;
        console.log('[Background] JSON 解析成功:', {
          dataType: typeof parsedBody,
          isArray: Array.isArray(parsedBody),
          keys:
            parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody).slice(0, 10) : []
        });
      } catch (e) {
        console.error('[Background] JSON 解析失败:', e.message);
        console.log('[Background] 原始响应体:', responseBody);
      }
    }

    const result = {
      status: response.status,
      statusText: response.statusText || getStatusText(response.status),
      headers: responseHeaders,
      body: responseBody,
      ok: response.ok
    };

    if (hasParsedBody) {
      result.bodyParsed = parsedBody;
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    console.error('[Background] 请求失败:', {
      url,
      error: error.message,
      errorType: error.name,
      errorStack: error.stack
    });

    // 为网页控制台也记录错误
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'debug_log',
              source: 'Background',
              message: '请求失败',
              data: {
                url,
                error: error.message,
                errorType: error.name
              }
            })
            .catch(() => {});
        }
      });
    });

    if (error.name === 'AbortError') {
      throw new Error('请求超时 (' + timeout + 'ms)');
    }

    // 检测常见的网络错误
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      // 这通常意味着网络错误、CORS错误或服务器不可达
      const detailedError = `无法连接到服务器 ${url}
请检查：
1. 目标服务器是否已启动
2. 网络是否正常
3. 防火墙设置
4. CORS 配置是否正确`;
      console.error('[Background] Failed to fetch 详细错误:', detailedError);
      throw new Error(detailedError);
    }

    if (error.name === 'NetworkError') {
      throw new Error('网络错误：' + error.message);
    }

    // 对于其他错误，提供更详细的信息
    throw new Error('请求失败：' + (error.message || '未知错误'));
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
      .then((response) => {
        // 检查是否仍然可以发送响应
        try {
          sendResponse({ success: true, data: response });
        } catch (e) {
          console.warn('Failed to send response, port might be closed:', e);
        }
      })
      .catch((error) => {
        console.error('[Background] 准备发送错误响应:', {
          errorMessage: error.message,
          errorType: error.name
        });

        try {
          sendResponse({
            success: false,
            error: error.message,
            errorDetails: {
              name: error.name,
              message: error.message,
              url: request.data?.url
            }
          });
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

  // 处理 cURL 显示设置
  if (request.action === 'setCurlDisplayDisabled') {
    console.log('[Background] 设置 cURL 显示状态:', request.disabled);

    // 使用 setTimeout 确保异步操作
    setTimeout(() => {
      chrome.storage.local.set({ curlDisplayDisabled: request.disabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Background] 保存 cURL 显示设置失败:', chrome.runtime.lastError);
          try {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } catch (e) {
            console.warn('[Background] 发送错误响应失败:', e);
          }
          return;
        }

        console.log('[Background] cURL 显示设置保存成功');
        try {
          sendResponse({ success: true });
        } catch (e) {
          console.warn('[Background] 发送成功响应失败:', e);
        }
      });
    }, 0);

    return true; // 表示异步响应
  }

  if (request.action === 'getCurlDisplayDisabled') {
    console.log('[Background] 获取 cURL 显示状态');

    // 使用 setTimeout 确保异步操作
    setTimeout(() => {
      chrome.storage.local.get(['curlDisplayDisabled'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[Background] 获取 cURL 显示设置失败:', chrome.runtime.lastError);
          try {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } catch (e) {
            console.warn('[Background] 发送错误响应失败:', e);
          }
          return;
        }

        const disabled = result.curlDisplayDisabled || false;
        console.log('[Background] 当前 cURL 显示状态:', {
          curlDisplayDisabled: result.curlDisplayDisabled,
          disabled: disabled,
          isDisabled: disabled === true
        });
        try {
          sendResponse({ disabled: disabled });
        } catch (e) {
          console.warn('[Background] 发送 cURL 状态响应失败:', e);
        }
      });
    }, 0);

    return true; // 表示异步响应
  }

  return false;
});

// 处理扩展安装或更新
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装时设置默认配置
    chrome.storage.local.set({
      allowedDomains: ['*'],
      curlDisplayDisabled: false, // 默认启用 cURL 显示
      settings: {
        enableLogging: false,
        maxTimeout: 60000
      }
    });
    console.log('[Background] 扩展已安装，cURL 显示默认启用');
  } else if (details.reason === 'update') {
    // 处理版本更新
    console.log(
      'Extension updated from',
      details.previousVersion,
      'to',
      chrome.runtime.getManifest().version
    );
    // 确保 cURL 设置存在
    chrome.storage.local.get(['curlDisplayDisabled'], (result) => {
      if (result.curlDisplayDisabled === undefined) {
        chrome.storage.local.set({ curlDisplayDisabled: false });
        console.log('[Background] 更新后设置 cURL 显示默认启用');
      }
    });
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
