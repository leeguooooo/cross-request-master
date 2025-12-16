(function (win) {
  'use strict';

  // 检查是否已经加载过
  if (win.__crossRequestLoaded) {
    return;
  }
  win.__crossRequestLoaded = true;

  const isYapiContext = () => {
    try {
      return !!(win.document && win.document.getElementById('yapi'));
    } catch (e) {
      return false;
    }
  };

  const toAbsoluteUrl = (inputUrl) => {
    if (typeof inputUrl !== 'string') return inputUrl;
    const url = inputUrl.trim();
    if (!url) return url;

    // 已经是绝对 URL（含协议）
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      return url;
    }

    // protocol-relative URL: //example.com/path
    if (url.startsWith('//')) {
      return (win.location && win.location.protocol ? win.location.protocol : 'https:') + url;
    }

    try {
      return new URL(
        url,
        win.location && win.location.href ? win.location.href : undefined
      ).toString();
    } catch (e) {
      return url;
    }
  };

  // 静默模式：非 YApi 页面默认静默（避免误拦截导致页面加载失败）
  // 允许外部显式强制静默：window.__crossRequestSilentMode = true
  const isSilentMode = win.__crossRequestSilentMode === true ? true : !isYapiContext();

  // 静默模式下不输出调试日志
  const debugLog = isSilentMode ? () => {} : console.log.bind(console);

  debugLog('[Index] index.js 脚本开始执行（' + (isSilentMode ? '静默' : '完整') + '模式）');

  // 使用提取的 helpers（由 content-script.js 预先加载）
  // 提供内联 fallback 确保扩展不会因为 helper 加载失败而崩溃
  const helpers = win.CrossRequestHelpers || {};

  // Fallback: bodyToString
  if (!helpers.bodyToString) {
    console.warn('[Index] bodyToString helper 未加载，使用内联 fallback');
    helpers.bodyToString = function (body) {
      if (body === undefined || body === null) {
        return '';
      }
      if (typeof body === 'object') {
        return JSON.stringify(body);
      }
      if (typeof body === 'string') {
        return body;
      }
      return String(body);
    };
  }

  // Fallback: buildQueryString
  if (!helpers.buildQueryString) {
    console.warn('[Index] buildQueryString helper 未加载，使用内联 fallback');
    helpers.buildQueryString = function (params) {
      if (!params || typeof params !== 'object') {
        return '';
      }
      const pairs = [];
      for (const key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
          const value = params[key];
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              value.forEach((item) => {
                pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
              });
            } else if (typeof value === 'object') {
              pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
            } else {
              pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
          }
        }
      }
      return pairs.length > 0 ? pairs.join('&') : '';
    };
  }

  // Fallback: safeLogResponse
  if (!helpers.safeLogResponse) {
    console.warn('[Index] safeLogResponse helper 未加载，使用内联 fallback');
    helpers.safeLogResponse = function (originalBody, options) {
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

  // 创建跨域请求的 API
  const CrossRequestAPI = {
    // 请求计数器
    requestId: 0,

    // 待处理的请求
    pendingRequests: new Map(),

    // 发送跨域请求
    async request(options) {
      const id = `request-${++this.requestId}`;

      const promise = new Promise((resolve, reject) => {
        // 保存回调
        this.pendingRequests.set(id, { resolve, reject });
      });

      // 规范化 method 为大写，确保大小写不敏感的比较
      const method = (options.method || 'GET').toUpperCase();
      const data = options.data || options.body;
      let url = options.url;
      let body = data;

      // 对于 GET/HEAD 请求，将参数转换为查询字符串附加到 URL
      if ((method === 'GET' || method === 'HEAD') && data) {
        const queryString =
          typeof data === 'object' ? helpers.buildQueryString(data) : String(data);
        if (queryString) {
          url = url + (url.includes('?') ? '&' : '?') + queryString;
        }
        body = undefined; // GET/HEAD 请求不应该有 body
      }

      // 背景页 fetch 需要绝对 URL：非 YApi 页面常见使用相对路径（如 /api/...）
      url = toAbsoluteUrl(url);

      // 支持 FormData/File/Blob 的序列化（Issue #14）
      if (body !== undefined && helpers.serializeRequestBody) {
        try {
          body = await helpers.serializeRequestBody(body);
        } catch (e) {
          console.warn('[Index] FormData 序列化失败，降级为原始 body:', e.message);
        }
      }

      // 创建请求数据
      const requestData = {
        id,
        url,
        method,
        headers: options.headers || {},
        body,
        timeout: options.timeout || 30000
      };

      // 将请求数据编码并插入到 DOM
      const container = document.createElement('div');
      container.id = `y-request-${id}`;
      container.style.display = 'none';
      container.textContent = btoa(encodeURIComponent(JSON.stringify(requestData)));
      (document.body || document.documentElement).appendChild(container);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          const pending = this.pendingRequests.get(id);
          const timeoutResponse = {
            status: 0,
            statusText: '请求超时',
            headers: {},
            data: { error: '请求超时' },
            body: JSON.stringify({ error: '请求超时' }),
            ok: false,
            isError: true
          };
          pending.resolve(timeoutResponse);
          this.pendingRequests.delete(id);
        }
      }, requestData.timeout);

      return promise;
    },

    // 处理响应
    handleResponse(event) {
      const { id, response } = event.detail;
      const pending = this.pendingRequests.get(id);

      if (pending) {
        // 使用 response-handler helper 处理响应（如果可用）
        if (helpers.processBackgroundResponse) {
          // 使用提取的生产函数
          const processed = helpers.processBackgroundResponse(response);
          pending.resolve(processed);
          this.pendingRequests.delete(id);
          return;
        }

        // Fallback: 内联实现（如果 helper 未加载）
        console.warn('[Index] processBackgroundResponse helper 未加载，使用 fallback');

        // 确保 response 对象存在
        if (!response) {
          console.error('[Index] 收到空响应');
          pending.resolve({
            status: 0,
            statusText: 'No Response',
            headers: {},
            data: {},
            body: ''
          });
          this.pendingRequests.delete(id);
          return;
        }
        // 处理响应体，为 YApi 提供正确的数据格式
        const headers = response.headers || {};
        const contentType = headers['content-type'] || '';
        const looksLikeJsonString = (val) => {
          if (typeof val !== 'string') return false;
          const trimmed = val.trim();
          return trimmed.startsWith('{') || trimmed.startsWith('[');
        };
        const hasBodyProp = Object.prototype.hasOwnProperty.call(response, 'body');
        const hasBodyParsedProp = Object.prototype.hasOwnProperty.call(response, 'bodyParsed');
        const hasDataProp = Object.prototype.hasOwnProperty.call(response, 'data');

        let parsedData;

        // 优先使用 background.js 提供的解析结果，必要时重新解析字符串
        if (hasBodyParsedProp) {
          parsedData = response.bodyParsed;
          debugLog('[Index] 使用 bodyParsed 作为解析结果');
        } else if (hasDataProp && response.data !== undefined) {
          parsedData = response.data;
          debugLog('[Index] 使用 response.data 作为解析结果');
        } else if (
          (contentType.includes('application/json') || looksLikeJsonString(response.body)) &&
          hasBodyProp &&
          response.body != null
        ) {
          if (typeof response.body === 'object' && response.body !== null) {
            parsedData = response.body;
            debugLog('[Index] response.body 已是对象，直接使用:', {
              type: typeof response.body,
              isArray: Array.isArray(response.body),
              value: helpers.safeLogResponse(response.body)
            });
          } else if (typeof response.body === 'string') {
            try {
              parsedData = JSON.parse(response.body);
              debugLog('[Index] 为 YApi 解析 JSON 成功:', {
                originalType: typeof response.body,
                parsedType: typeof parsedData,
                isObject: parsedData && typeof parsedData === 'object',
                value: parsedData
              });
            } catch (e) {
              console.warn('[Index] JSON 解析失败，使用原始响应:', e.message);
              parsedData = {
                error: 'JSON解析失败',
                raw: response.body
              };
            }
          } else {
            parsedData = response.body;
            debugLog('[Index] response.body 是标量值，直接使用:', {
              type: typeof response.body,
              value: helpers.safeLogResponse(response.body)
            });
          }
        } else if (hasBodyProp && (response.body === undefined || response.body === null)) {
          parsedData = {};
        } else if (hasBodyProp) {
          parsedData = response.body;
        } else {
          parsedData = {};
        }

        // 确保 body 始终是字符串格式（用于向后兼容）
        const bodySource = hasBodyProp
          ? response.body
          : hasBodyParsedProp
            ? response.bodyParsed
            : '';
        const bodyString = helpers.bodyToString(bodySource);

        const processedResponse = {
          status: response.status || 0,
          statusText: response.statusText || 'OK', // 确保有默认值
          headers,
          data: parsedData === undefined ? {} : parsedData, // 只有 undefined 才用 {}，保留 null/0/false/"" 等所有合法值
          body: bodyString // 保留原始字符串格式
        };

        if (hasBodyParsedProp) {
          processedResponse.bodyParsed = response.bodyParsed;
        }

        pending.resolve(processedResponse);
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

  // YApi 兼容的 crossRequest 方法
  function createCrossRequestMethod() {
    return function (options) {
      debugLog('[Index] YApi crossRequest 被调用:', options?.url);

      // 处理 YApi 参数格式
      if (typeof options === 'string') {
        options = { url: options };
      }

      // 准备请求数据
      const requestData = {
        url: options.url,
        method: options.method || options.type || 'GET',
        headers: options.headers || {},
        data: options.data || options.body,
        timeout: options.timeout || 30000
      };

      // 添加常见的浏览器请求头
      if (!requestData.headers['User-Agent']) {
        requestData.headers['User-Agent'] = navigator.userAgent;
      }

      // 只为非 GET/HEAD 请求添加 Content-Type（有数据时）
      if (requestData.data && requestData.method !== 'GET' && requestData.method !== 'HEAD') {
        const hasContentType =
          !!requestData.headers['Content-Type'] || !!requestData.headers['content-type'];

        const isFormLike =
          (typeof FormData !== 'undefined' && requestData.data instanceof FormData) ||
          (typeof Blob !== 'undefined' && requestData.data instanceof Blob) ||
          (typeof File !== 'undefined' && requestData.data instanceof File) ||
          (typeof URLSearchParams !== 'undefined' && requestData.data instanceof URLSearchParams) ||
          (typeof ArrayBuffer !== 'undefined' && requestData.data instanceof ArrayBuffer) ||
          (typeof DataView !== 'undefined' && requestData.data instanceof DataView);

        // 让浏览器为 FormData/Blob 设置 multipart 边界，避免破坏文件上传
        if (!hasContentType && !isFormLike) {
          if (typeof requestData.data === 'object') {
            requestData.headers['Content-Type'] = 'application/json';
          } else {
            requestData.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        }
      }

      // 添加常见的请求头
      if (!requestData.headers['Accept']) {
        requestData.headers['Accept'] = 'application/json, text/plain, */*';
      }

      // 从当前页面获取可能的认证信息
      const cookies = document.cookie;
      if (cookies && !requestData.headers['Cookie']) {
        requestData.headers['Cookie'] = cookies;
      }

      debugLog('[Index] 捕获的请求数据:', requestData);

      // 只在非静默模式下显示 cURL 命令
      if (!isSilentMode) {
        showCurlCommand(requestData);
      }

      // 发送请求
      const promise = CrossRequestAPI.request(requestData);

      // YApi 期望的回调格式
      promise
        .then((response) => {
          debugLog('[Index] YApi 请求成功，状态:', response.status);

          // 检查是否是错误响应
          if (response.isError) {
            // 这是一个网络错误或其他错误
            const errorMsg = response.statusText || '请求失败';
            if (!isSilentMode) {
              createErrorDisplay(errorMsg);
            }

            if (options.error) {
              // 构建错误响应体
              let errorBody;
              // 检查 body 是否已经是对象
              if (typeof response.body === 'object' && response.body !== null) {
                errorBody = response.body;
              } else if (typeof response.body === 'string' && response.body !== '') {
                // 非空字符串才尝试解析（空字符串不是合法的 JSON）
                try {
                  errorBody = JSON.parse(response.body);
                } catch (e) {
                  errorBody = {
                    data: {
                      success: false,
                      error: errorMsg,
                      message: errorMsg,
                      code: 'NETWORK_ERROR'
                    }
                  };
                }
              } else {
                errorBody = {
                  data: {
                    success: false,
                    error: errorMsg,
                    message: errorMsg,
                    code: 'NETWORK_ERROR'
                  }
                };
              }

              const errorHeader = response.headers || { 'content-type': 'application/json' };
              const errorData = {
                res: {
                  body:
                    response.body != null
                      ? helpers.bodyToString(response.body)
                      : JSON.stringify(errorBody),
                  header: errorHeader,
                  status: response.status || 0, // 保留原始状态码，如果没有则用 0
                  statusText: response.statusText || 'Network Error',
                  success: false // res 里面也需要 success
                },
                status: response.status || 0, // 保留原始状态码，如果没有则用 0
                statusText: response.statusText || 'Network Error',
                success: false // 顶层的 success 字段
              };

              debugLog('[Index] 处理 isError 响应，调用 error 回调');

              options.error(errorBody, errorHeader, errorData);
              return;
            }
            // 如果没有错误回调，继续执行 success 回调，让 YApi 处理错误
            debugLog('[Index] 没有 error 回调，将错误传递给 success 回调');
          }

          // 检查HTTP状态码
          if (response.status && response.status >= 400) {
            let errorMsg = `HTTP ${response.status}`;
            switch (response.status) {
              case 400:
                errorMsg = '请求参数错误 (400)';
                break;
              case 401:
                errorMsg = '未授权，请检查认证信息 (401)';
                break;
              case 403:
                errorMsg = '访问被拒绝 (403)';
                break;
              case 404:
                errorMsg = '请求的资源不存在 (404)';
                break;
              case 500:
                errorMsg = '服务器内部错误 (500)';
                break;
              case 502:
                errorMsg = '网关错误 (502)';
                break;
              case 503:
                errorMsg = '服务暂时不可用 (503)';
                break;
            }

            // 显示错误提示（仅非静默模式）
            if (!isSilentMode) {
              createErrorDisplay(errorMsg);
            }
          }

          if (options.success) {
            // 使用 response-handler helper 构建 YApi 回调参数（如果可用）
            let yapiRes, yapiHeader, yapiData;

            if (helpers.buildYapiCallbackParams) {
              // 使用提取的生产函数
              const params = helpers.buildYapiCallbackParams(response);
              yapiRes = params.yapiRes;
              yapiHeader = params.yapiHeader;
              yapiData = params.yapiData;
            } else {
              // Fallback: 内联实现（如果 helper 未加载）
              console.warn('[Index] buildYapiCallbackParams helper 未加载，使用 fallback');

              // 根据 YApi postmanLib.js 源码，构建期望的数据结构
              // YApi 期望第一个参数是响应内容（字符串或对象）
              // 优先使用已经解析好的 response.data，如果不存在再使用 response.body/bodyParsed
              const headers = response.headers || {};
              const contentType = headers['content-type'] || '';
              const looksLikeJsonString = (val) => {
                if (typeof val !== 'string') return false;
                const trimmed = val.trim();
                return trimmed.startsWith('{') || trimmed.startsWith('[');
              };
              const hasBodyProp = Object.prototype.hasOwnProperty.call(response, 'body');
              const hasBodyParsedProp = Object.prototype.hasOwnProperty.call(
                response,
                'bodyParsed'
              );
              const hasDataProp = Object.prototype.hasOwnProperty.call(response, 'data');

              if (contentType.includes('application/json') || looksLikeJsonString(response.body)) {
                if (hasDataProp && response.data !== undefined) {
                  yapiRes = response.data;
                  debugLog('[Index] 使用 response.data 构建 yapiRes');
                } else if (hasBodyParsedProp) {
                  yapiRes = response.bodyParsed;
                  debugLog('[Index] 使用 bodyParsed 构建 yapiRes');
                } else if (hasBodyProp && response.body != null) {
                  if (typeof response.body === 'object' && response.body !== null) {
                    yapiRes = response.body;
                    debugLog('[Index] body 已是对象，直接使用');
                  } else if (typeof response.body === 'string') {
                    try {
                      yapiRes = JSON.parse(response.body);
                      debugLog('[Index] 从 body 重新解析 JSON 成功');
                    } catch (e) {
                      console.warn('[Index] JSON 解析失败，使用原始响应:', e.message);
                      yapiRes = response.body;
                    }
                  } else {
                    yapiRes = response.body;
                  }
                }

                if (yapiRes === undefined) {
                  yapiRes = {};
                }
              } else {
                if (hasBodyProp) {
                  yapiRes = response.body != null ? response.body : '';
                } else if (hasBodyParsedProp) {
                  yapiRes = response.bodyParsed != null ? response.bodyParsed : '';
                } else {
                  yapiRes = '';
                }
              }

              yapiHeader = headers; // 响应头
              const bodySource = hasBodyProp
                ? response.body
                : hasBodyParsedProp
                  ? response.bodyParsed
                  : '';
              const yapiBodyString = helpers.bodyToString(bodySource); // 确保 body 为字符串格式

              yapiData = {
                res: {
                  body: yapiBodyString, // 原始响应体字符串
                  header: headers, // 响应头
                  status: response.status || 0, // 状态码
                  statusText: response.statusText || 'OK',
                  success: true // 成功响应也需要 success
                },
                // 额外的顶层属性
                status: response.status || 0,
                statusText: response.statusText || 'OK',
                success: true // 顶层的 success 字段
              };
            }

            debugLog('[Index] 准备调用 YApi success 回调');

            try {
              // YApi 期望的回调参数：success(res, header, data)
              options.success(yapiRes, yapiHeader, yapiData);
            } catch (callbackError) {
              console.error('[Index] YApi success 回调执行出错:', callbackError);

              // 尝试简化的格式
              try {
                debugLog('[Index] 尝试简化格式...');
                options.success(response.data, response.headers, response);
              } catch (secondError) {
                console.error('[Index] 简化格式也失败:', secondError);
              }
            }
          }
        })
        .catch((error) => {
          // 处理 promise rejection
          debugLog('[Index] Promise rejected:', error.message);

          // 显示错误提示（仅非静默模式）
          const errorMsg = error.message || '请求失败';

          if (!isSilentMode) {
            createErrorDisplay(errorMsg);
          }

          if (options.error) {
            // 与成功响应使用相同的参数结构
            // 网络错误时没有响应体
            const errorBody = undefined;
            const errorHeader = {
              'content-type': 'application/json'
            };
            // 使用 503 表示服务不可用
            const errorData = {
              res: {
                body: errorBody, // 空字符串，因为网络错误没有响应体
                header: errorHeader,
                status: 503, // 503 Service Unavailable
                statusText: 'Service Unavailable',
                success: false // res 里面也需要 success
              },
              status: 503, // 503 Service Unavailable
              statusText: 'Service Unavailable',
              success: false // 顶层的 success 字段
            };

            debugLog('[Index] 调用 error 回调');

            // 使用与 success 相同的三个参数
            options.error(errorBody, errorHeader, errorData);
          } else if (options.success) {
            // 如果没有错误回调，调用 success 回调但传递错误信息
            // YApi 可能会检查第一个参数来判断是否有错误
            // 网络错误时没有响应体
            const errorBody = '';
            const errorHeader = {
              'content-type': 'application/json'
            };
            // 使用 503 表示服务不可用
            const errorData = {
              res: {
                body: errorBody, // 空字符串，因为网络错误没有响应体
                header: errorHeader,
                status: 503, // 503 Service Unavailable
                statusText: 'Service Unavailable',
                success: false // res 里面也需要 success
              },
              status: 503, // 503 Service Unavailable
              statusText: 'Service Unavailable',
              success: false // 顶层的 success 字段
            };

            debugLog('[Index] 使用 success 回调传递错误');

            options.success(errorBody, errorHeader, errorData);
          }
        });

      return promise;
    };
  }

  // 复制到剪贴板的现代函数
  async function copyToClipboard(text) {
    try {
      // 优先使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      // 备用方法：创建临时文本区域
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      textarea.setAttribute('readonly', '');
      const parent = document.body || document.documentElement;
      parent.appendChild(textarea);

      // 选择文本
      textarea.select();
      textarea.setSelectionRange(0, 99999); // 移动设备兼容

      // 尝试复制
      let success = false;
      try {
        // 虽然 execCommand 已废弃，但在 Clipboard API 不可用时仍然是唯一选择
        success = document.execCommand('copy');
      } catch (err) {
        console.warn('[Index] 复制命令执行失败:', err);
      }

      parent.removeChild(textarea);
      return success;
    } catch (err) {
      console.error('[Index] 复制到剪贴板失败:', err);
      return false;
    }
  }

  // 生成 cURL 命令字符串
  function generateCurlCommand(url, method, headers, body) {
    let curl = `curl -X ${method}`;

    // 添加请求头
    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([key, value]) => {
        // 过滤掉空值和过长的值（如 User-Agent）
        if (value && value.trim && value.trim() !== '' && value.length < 200) {
          curl += ` \\\n  -H "${key}: ${value}"`;
        }
      });
    }

    // 添加请求体（只有非 GET 请求且有数据时才添加）
    if (body && method !== 'GET' && method !== 'DELETE') {
      // 如果 body 是对象，转换为 JSON 字符串
      let bodyStr = body;
      if (typeof body === 'object') {
        bodyStr = JSON.stringify(body);
      }
      curl += ` \\\n  -d '${bodyStr}'`;
    }

    // 添加 URL（放在最后）
    curl += ` \\\n  "${url}"`;

    return curl;
  }

  // 创建错误提示框
  function createErrorDisplay(errorMessage) {
    // 移除已存在的错误提示
    const existingError = document.getElementById('cross-request-error-display');
    if (existingError) {
      existingError.remove();
    }

    const errorDisplay = document.createElement('div');
    errorDisplay.id = 'cross-request-error-display';
    errorDisplay.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 300px;
            max-width: 500px;
            background: #f56565;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            z-index: 10001;
            animation: slideDown 0.3s ease-out;
        `;

    errorDisplay.innerHTML = `
            <div style="padding: 16px; display: flex; align-items: center; gap: 12px;">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7v4a1 1 0 102 0V7a1 1 0 10-2 0zm0 8a1 1 0 102 0 1 1 0 00-2 0z" fill="currentColor"/>
                </svg>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">请求失败</div>
                    <div style="opacity: 0.9; font-size: 13px; white-space: pre-line;">${errorMessage}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: transparent; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; opacity: 0.7; hover:opacity: 1;">×</button>
            </div>
        `;

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translate(-50%, -20px);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, 0);
                }
            }
        `;
    document.head.appendChild(style);

    if (document.body) {
      document.body.appendChild(errorDisplay);
    } else {
      console.warn('[Index] document.body 不存在，无法显示错误提示');
      return;
    }

    // 5秒后自动隐藏
    setTimeout(() => {
      errorDisplay.style.opacity = '0';
      errorDisplay.style.transform = 'translate(-50%, -20px)';
      setTimeout(() => errorDisplay.remove(), 300);
    }, 5000);
  }

  // 自动隐藏定时器
  let curlHideTimer = null;

  // 创建页面内的 cURL 显示框
  function createCurlDisplay() {
    // 检查是否已经存在
    const existingDisplay = document.getElementById('cross-request-curl-display');
    if (existingDisplay) {
      // 重新绑定事件监听器，防止事件丢失
      bindCurlDisplayEvents();
      return existingDisplay;
    }

    const curlDisplay = document.createElement('div');
    curlDisplay.id = 'cross-request-curl-display';
    curlDisplay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: 300px;
            background: #2d3748;
            color: #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            z-index: 10000;
            display: none;
            overflow: hidden;
            opacity: 1;
            transition: opacity 0.3s ease-out;
        `;

    curlDisplay.innerHTML = `
            <div style="padding: 12px; background: #4a5568; border-bottom: 1px solid #718096; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: #68d391;">cURL 命令</span>
                <div>
                    <button id="curl-copy-btn" style="background: #48bb78; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 4px; font-size: 11px;">复制</button>
                    <button id="curl-disable-btn" style="background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 4px; font-size: 11px;">永久关闭</button>
                    <button id="curl-close-btn" style="background: #f56565; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">×</button>
                </div>
            </div>
            <pre id="curl-command-text" style="margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 200px; line-height: 1.4;"></pre>
        `;

    if (document.body) {
      document.body.appendChild(curlDisplay);
    } else {
      console.warn('[Index] document.body 不存在，无法显示 cURL');
      return null;
    }

    // 绑定事件
    bindCurlDisplayEvents();

    return curlDisplay;
  }

  // 绑定 cURL 显示框事件（防止事件丢失）
  function bindCurlDisplayEvents() {
    const copyBtn = document.getElementById('curl-copy-btn');
    const closeBtn = document.getElementById('curl-close-btn');
    const disableBtn = document.getElementById('curl-disable-btn');

    if (!copyBtn || !closeBtn || !disableBtn) {
      console.warn('[Index] cURL 显示框按钮元素未找到');
      return;
    }

    // 清除旧的事件监听器（如果存在）
    copyBtn.onclick = null;
    closeBtn.onclick = null;
    disableBtn.onclick = null;

    // 重新绑定事件
    copyBtn.addEventListener('click', async () => {
      const curlText = document.getElementById('curl-command-text').textContent;

      debugLog('[Index] 复制按钮被点击');
      // 使用现代复制方法
      const success = await copyToClipboard(curlText);
      if (success) {
        copyBtn.textContent = '已复制';
        setTimeout(() => {
          copyBtn.textContent = '复制';
        }, 2000);
      } else {
        copyBtn.textContent = '复制失败';
        setTimeout(() => {
          copyBtn.textContent = '复制';
        }, 2000);
      }
    });

    closeBtn.addEventListener('click', () => {
      debugLog('[Index] 关闭按钮被点击');
      hideCurlDisplay();
    });

    disableBtn.addEventListener('click', () => {
      debugLog('[Index] 永久关闭按钮被点击');
      // 通过 DOM 事件发送消息给 content script
      const event = new CustomEvent('curl-disable-request', {
        detail: { disabled: true }
      });
      document.dispatchEvent(event);
      hideCurlDisplay();
    });

    debugLog('[Index] cURL 显示框事件已重新绑定');
  }

  // 隐藏 cURL 显示框
  function hideCurlDisplay() {
    const curlDisplay = document.getElementById('cross-request-curl-display');
    if (curlDisplay) {
      // 清除现有定时器
      if (curlHideTimer) {
        clearTimeout(curlHideTimer);
        curlHideTimer = null;
      }

      // 淡出动画
      curlDisplay.style.opacity = '0';
      setTimeout(() => {
        curlDisplay.style.display = 'none';
        curlDisplay.style.opacity = '1'; // 重置透明度，为下次显示做准备
      }, 300);
    }
  }

  // 设置自动隐藏定时器
  function setAutoHideTimer() {
    // 清除现有定时器
    if (curlHideTimer) {
      clearTimeout(curlHideTimer);
    }

    // 设置新的3秒定时器
    curlHideTimer = setTimeout(() => {
      hideCurlDisplay();
      curlHideTimer = null;
    }, 3000);
  }

  // 显示 cURL 命令
  function showCurlCommand(requestData) {
    // 检查是否已被永久关闭
    debugLog('[Index] 准备检查 cURL 禁用状态');
    const event = new CustomEvent('curl-check-disabled', {
      detail: { requestData: requestData }
    });
    document.dispatchEvent(event);
    debugLog('[Index] curl-check-disabled 事件已发送');
  }

  // 显示 cURL 弹窗（由 content script 调用）
  function displayCurlCommand(requestData) {
    debugLog('[Index] displayCurlCommand 被调用');

    const curlDisplay = createCurlDisplay();
    if (!curlDisplay) {
      console.error('[Index] 创建 cURL 显示框失败');
      return;
    }
    debugLog('[Index] cURL 显示框已创建/获取');

    const curlCommand = generateCurlCommand(
      requestData.url,
      requestData.method,
      requestData.headers,
      requestData.data || requestData.body
    );
    debugLog('[Index] cURL 命令已生成');

    const curlText = document.getElementById('curl-command-text');
    if (!curlText) {
      console.error('[Index] 找不到 curl-command-text 元素');
      return;
    }

    // 更新内容并显示
    curlText.textContent = curlCommand;
    curlDisplay.style.display = 'block';
    curlDisplay.style.opacity = '1'; // 确保透明度正确

    debugLog('[Index] cURL 显示框已显示');

    // 确保事件监听器已绑定
    setTimeout(() => {
      bindCurlDisplayEvents();
    }, 100);

    // 设置自动隐藏定时器
    setAutoHideTimer();

    debugLog('[Index] cURL 弹窗显示完成');
  }

  // 监听来自 content script 的响应事件
  document.addEventListener('curl-show-command', (event) => {
    const requestData = event.detail;
    debugLog('[Index] 收到 curl-show-command 事件');
    displayCurlCommand(requestData);
  });

  debugLog('[Index] curl-show-command 事件监听器已注册');

  // 创建兼容的 jQuery ajax 方法
  function createAjaxMethod() {
    return function (options) {
      // 处理 jQuery ajax 的参数格式
      if (typeof options === 'string') {
        options = { url: options };
      }

      // 准备请求数据
      const requestData = {
        url: options.url,
        method: options.type || options.method || 'GET',
        headers: options.headers || {},
        data: options.data,
        timeout: options.timeout
      };

      // 添加常见的浏览器请求头
      if (!requestData.headers['User-Agent']) {
        requestData.headers['User-Agent'] = navigator.userAgent;
      }

      // 只为非 GET/HEAD 请求添加 Content-Type（有数据时）
      if (requestData.data && requestData.method !== 'GET' && requestData.method !== 'HEAD') {
        if (!requestData.headers['Content-Type'] && !requestData.headers['content-type']) {
          if (typeof requestData.data === 'object') {
            requestData.headers['Content-Type'] = 'application/json';
          } else {
            requestData.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        }
      }

      // 添加常见的请求头
      if (!requestData.headers['Accept']) {
        requestData.headers['Accept'] = 'application/json, text/plain, */*';
      }

      // 从当前页面获取可能的认证信息
      const cookies = document.cookie;
      if (cookies && !requestData.headers['Cookie']) {
        requestData.headers['Cookie'] = cookies;
      }

      debugLog('[Index] jQuery ajax 捕获的请求数据:', requestData.url);

      // 显示 cURL 命令（仅非静默模式）
      if (!isSilentMode) {
        showCurlCommand(requestData);
      }

      // 转换 jQuery 的 success/error 回调为 Promise
      const promise = CrossRequestAPI.request(requestData);

      // 将 cross-request 响应转换为 jQuery jqXHR 对象
      // 这解决了 issue #23：提供标准的 responseText, responseJSON 等属性
      function toJqXHR(response) {
        // 正确处理 responseText
        let responseText = '';
        if (response.body != null) {
          responseText =
            typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
        }

        // 只有在响应是 JSON 时才设置 responseJSON
        // 这与 jQuery 的行为一致：非 JSON 响应的 responseJSON 应该是 undefined
        let responseJSON = undefined;
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json') && response.data !== undefined) {
          // 确保 response.data 是对象或数组，而不是字符串
          // 字符串说明没有被正确解析为 JSON
          if (
            typeof response.data === 'object' ||
            typeof response.data === 'boolean' ||
            typeof response.data === 'number'
          ) {
            responseJSON = response.data;
          } else if (typeof response.data === 'string') {
            // 尝试解析字符串为 JSON（兜底处理）
            try {
              responseJSON = JSON.parse(response.data);
            } catch (e) {
              // 解析失败，保持 undefined
              debugLog('[Index] responseJSON 解析失败，保持 undefined');
            }
          }
        }

        return {
          status: response.status,
          statusText: response.statusText,
          readyState: 4,
          responseText: responseText,
          responseJSON: responseJSON,
          getResponseHeader: function (name) {
            const headers = response.headers || {};
            const lower = name.toLowerCase();
            for (const key in headers) {
              if (
                Object.prototype.hasOwnProperty.call(headers, key) &&
                key.toLowerCase() === lower
              ) {
                return headers[key];
              }
            }
            return null;
          },
          getAllResponseHeaders: function () {
            const headers = response.headers || {};
            return Object.entries(headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n');
          }
        };
      }

      // 支持 jQuery 风格的回调
      if (options.success || options.error || options.complete) {
        promise.then(
          (response) => {
            debugLog('[Index] jQuery ajax 收到响应:', response.status);

            // 创建符合 jQuery 标准的 jqXHR 对象
            const jqXHR = toJqXHR(response);

            if (options.success) {
              // jQuery success 回调签名: success(data, textStatus, jqXHR)
              debugLog('[Index] 传递给 success 回调');
              options.success(response.data, 'success', jqXHR);
            }
            if (options.complete) {
              // jQuery complete 回调签名: complete(jqXHR, textStatus)
              options.complete(jqXHR, 'success');
            }
          },
          (error) => {
            // 为错误情况创建最小化的 jqXHR 对象
            const errorJqXHR = {
              status: 0,
              statusText: error.message,
              readyState: 0,
              responseText: '',
              responseJSON: undefined,
              getResponseHeader: () => null,
              getAllResponseHeaders: () => ''
            };

            if (options.error) {
              // jQuery error 回调签名: error(jqXHR, textStatus, errorThrown)
              options.error(errorJqXHR, 'error', error.message);
            }
            if (options.complete) {
              options.complete(errorJqXHR, 'error');
            }
          }
        );
      }

      // 返回 Promise 以支持现代用法
      return promise;
    };
  }

  // 暴露 API
  // YApi 直接调用 window.crossRequest(options)
  win.crossRequest = createCrossRequestMethod();

  // 同时保持向后兼容
  win.crossRequest.fetch = CrossRequestAPI.request.bind(CrossRequestAPI);
  win.crossRequest.ajax = createAjaxMethod();

  // 暴露 YApi OpenAPI（Yapi-MCP tool 同名）客户端
  // 仅依赖 window.crossRequest.fetch，因此不会影响现有功能
  try {
    const createYapiOpenApiClient =
      helpers.createYapiOpenApiClient ||
      function () {
        throw new Error('createYapiOpenApiClient helper 未加载');
      };

    if (!win.crossRequest.yapiMcp) {
      const client = createYapiOpenApiClient(win.crossRequest.fetch, {
        baseUrl: win.location && win.location.origin ? win.location.origin : '',
        token: ''
      });
      win.crossRequest.yapiMcp = client;
      // 兼容更直观的命名
      win.crossRequest.yapi = client;
    }
  } catch (e) {
    debugLog('[Cross-Request] YApi OpenAPI 客户端初始化失败:', e && e.message ? e.message : e);
  }

  console.log('[Cross-Request] API 已暴露到 window.crossRequest');

  // 如果存在 jQuery，扩展它
  if (win.$ && win.$.ajax) {
    const originalAjax = win.$.ajax;
    win.$.ajax = function (options) {
      // 智能模式：
      // 1. 完整模式（YApi等）：默认拦截，除非显式设置 crossRequest: false
      // 2. 静默模式（其他网站）：opt-in，只有显式设置 crossRequest: true 才拦截
      const inYapi = isYapiContext();
      if (inYapi) {
        // YApi：默认拦截（除非显式关闭）
        if (!options || options.crossRequest !== false) {
          return win.crossRequest.ajax(options);
        }
      } else {
        // 非 YApi：仅 opt-in（避免误拦截导致页面加载失败）
        if (options && options.crossRequest === true) {
          return win.crossRequest.ajax(options);
        }
      }
      return originalAjax.apply(this, arguments);
    };

    if (isSilentMode) {
      debugLog('[Cross-Request] jQuery.ajax 已扩展（opt-in 模式）');
    } else {
      debugLog('[Cross-Request] jQuery.ajax 已扩展（默认拦截模式）');
    }
  }

  // 创建标记，表示脚本已加载
  const sign = document.createElement('div');
  sign.id = 'cross-request-loaded';
  sign.style.display = 'none';
  if (document.body) {
    document.body.appendChild(sign);
  }

  debugLog('[Index] index.js 脚本执行完成，所有功能已注册');
})(window);
