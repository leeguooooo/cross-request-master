/**
 * Response Handler Helper
 * 
 * 处理 background.js 返回的响应，转换为 YApi 期望的格式
 * 这个模块被提取出来以便测试 Issue #22 的修复
 */

(function (window) {
  'use strict';

  // Import bodyToString helper
  const helpers = window.CrossRequestHelpers || {};
  
  /**
   * 将 background.js 的响应转换为 YApi success 回调的参数
   * @param {Object} response - background.js 返回的响应对象
   * @returns {Object} { yapiRes, yapiHeader, yapiData }
   */
  function buildYapiCallbackParams(response) {
    if (!response) {
      return {
        yapiRes: {},
        yapiHeader: {},
        yapiData: {
          res: {
            body: '',
            header: {},
            status: 0,
            statusText: 'No Response',
            success: false
          },
          status: 0,
          statusText: 'No Response',
          success: false
        }
      };
    }

    const contentType = response.headers['content-type'] || '';
    let yapiRes;

    // 处理 JSON 响应
    if (contentType.includes('application/json')) {
      // 优先使用已经解析好的 response.data，如果不存在再使用 response.body
      yapiRes = response.data;

      // 只有当 data 明确为 undefined 或 null 时才尝试重新解析 body
      if ((yapiRes === undefined || yapiRes === null) && response.body != null) {
        // 检查 body 是否已经是对象
        if (typeof response.body === 'object' && response.body !== null) {
          yapiRes = response.body;
        } else if (typeof response.body === 'string') {
          try {
            yapiRes = JSON.parse(response.body);
          } catch (e) {
            console.warn('[ResponseHandler] JSON 解析失败，使用原始响应:', e.message);
            yapiRes = response.body;
          }
        }
      }
    } else {
      // 对于非 JSON 响应，使用原始响应体
      yapiRes = response.body != null ? response.body : '';
    }

    const yapiHeader = response.headers || {};
    
    // 使用 bodyToString helper 确保 body 为字符串格式
    const bodyToString = helpers.bodyToString || function(body) {
      if (body == null) return '';
      if (typeof body === 'string') return body;
      if (typeof body === 'number' || typeof body === 'boolean') return String(body);
      try { return JSON.stringify(body); }
      catch (e) { return ''; }
    };
    
    const bodyString = bodyToString(response.body);

    const yapiData = {
      res: {
        body: bodyString, // 原始响应体字符串
        header: response.headers || {},
        status: response.status || 0,
        statusText: response.statusText || 'OK',
        success: true
      },
      status: response.status || 0,
      statusText: response.statusText || 'OK',
      success: true
    };

    return { yapiRes, yapiHeader, yapiData };
  }

  /**
   * 处理从 background.js 接收到的响应
   * 这是 index.js handleResponse 的核心逻辑
   * @param {Object} response - background.js 返回的响应
   * @returns {Object} 处理后的响应对象，包含 status, statusText, headers, data, body
   */
  function processBackgroundResponse(response) {
    if (!response) {
      return {
        status: 0,
        statusText: 'No Response',
        headers: {},
        data: {},
        body: ''
      };
    }

    // 处理响应体，为 YApi 提供正确的数据格式
    let parsedData = response.body;
    const contentType = response.headers['content-type'] || '';

    // 使用显式的 null/undefined 检查，避免过滤掉合法的 falsy 值（0, false, null, ""）
    if (contentType.includes('application/json') && response.body != null) {
      // 检查 body 是否已经是对象（background.js 已经解析过）
      if (typeof response.body === 'object' && response.body !== null) {
        // 已经是对象，直接使用
        parsedData = response.body;
      } else if (typeof response.body === 'string') {
        // 是字符串，需要解析
        try {
          parsedData = JSON.parse(response.body);
        } catch (e) {
          console.warn('[ResponseHandler] JSON 解析失败，使用原始响应:', e.message);
          // 如果解析失败，至少确保返回一个对象格式
          parsedData = {
            error: 'JSON解析失败',
            raw: response.body
          };
        }
      } else {
        // body 是其他类型（number, boolean 等），也是合法的 JSON
        parsedData = response.body;
      }
    } else if (response.body === undefined || response.body === null) {
      // 只有在明确是 undefined 或 null 时才返回空对象
      parsedData = {};
    }

    // 确保 body 始终是字符串格式（用于向后兼容）
    const bodyToString = helpers.bodyToString || function(body) {
      if (body == null) return '';
      if (typeof body === 'string') return body;
      if (typeof body === 'number' || typeof body === 'boolean') return String(body);
      try { return JSON.stringify(body); }
      catch (e) { return ''; }
    };
    const bodyString = bodyToString(response.body);

    return {
      status: response.status || 0,
      statusText: response.statusText || 'OK',
      headers: response.headers || {},
      data: parsedData === undefined ? {} : parsedData,
      body: bodyString
    };
  }

  // 导出到 window 对象
  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.buildYapiCallbackParams = buildYapiCallbackParams;
  window.CrossRequestHelpers.processBackgroundResponse = processBackgroundResponse;

  // 支持 CommonJS 用于测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildYapiCallbackParams,
      processBackgroundResponse
    };
  }
})(typeof window !== 'undefined' ? window : global);

