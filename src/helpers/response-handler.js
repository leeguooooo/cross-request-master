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

    const headers = response.headers || {};
    const contentType = headers['content-type'] || '';
    const hasDataProp = Object.prototype.hasOwnProperty.call(response, 'data');
    const hasBodyParsedProp = Object.prototype.hasOwnProperty.call(response, 'bodyParsed');
    let yapiRes;

    const looksLikeJsonString = (val) => {
      if (typeof val !== 'string') return false;
      const trimmed = val.trim();
      return trimmed.startsWith('{') || trimmed.startsWith('[');
    };

    if (contentType.includes('application/json') || looksLikeJsonString(response.body)) {
      if (hasDataProp && response.data !== undefined) {
        yapiRes = response.data;
      } else if (hasBodyParsedProp) {
        yapiRes = response.bodyParsed;
      } else if (response.body != null) {
        if (typeof response.body === 'object' && response.body !== null) {
          yapiRes = response.body;
        } else if (typeof response.body === 'string') {
          try {
            yapiRes = JSON.parse(response.body);
          } catch (e) {
            console.warn('[ResponseHandler] JSON 解析失败，使用原始响应:', e.message);
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
      yapiRes = response.body != null ? response.body : '';
    }

    const yapiHeader = headers;

    // 使用 bodyToString helper 确保 body 为字符串格式
    const bodyToString =
      helpers.bodyToString ||
      function (body) {
        if (body == null) return '';
        if (typeof body === 'string') return body;
        if (typeof body === 'number' || typeof body === 'boolean') return String(body);
        try {
          return JSON.stringify(body);
        } catch (e) {
          return '';
        }
      };

    const bodySource = Object.prototype.hasOwnProperty.call(response, 'body')
      ? response.body
      : hasBodyParsedProp
        ? response.bodyParsed
        : '';
    const bodyString = bodyToString(bodySource);

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

    const headers = response.headers || {};
    const contentType = headers['content-type'] || '';
    const hasBodyProp = Object.prototype.hasOwnProperty.call(response, 'body');
    const hasBodyParsedProp = Object.prototype.hasOwnProperty.call(response, 'bodyParsed');
    const hasDataProp = Object.prototype.hasOwnProperty.call(response, 'data');

    let parsedData;
    const looksLikeJsonString = (val) => {
      if (typeof val !== 'string') return false;
      const trimmed = val.trim();
      return trimmed.startsWith('{') || trimmed.startsWith('[');
    };

    // 优先使用 background.js 提供的解析结果，必要时重新解析字符串
    if (hasBodyParsedProp) {
      parsedData = response.bodyParsed;
    } else if (hasDataProp && response.data !== undefined) {
      parsedData = response.data;
    } else if (
      (contentType.includes('application/json') || looksLikeJsonString(response.body)) &&
      hasBodyProp &&
      response.body != null
    ) {
      if (typeof response.body === 'object' && response.body !== null) {
        parsedData = response.body;
      } else if (typeof response.body === 'string') {
        try {
          parsedData = JSON.parse(response.body);
        } catch (e) {
          console.warn('[ResponseHandler] JSON 解析失败，使用原始响应:', e.message);
          parsedData = {
            error: 'JSON解析失败',
            raw: response.body
          };
        }
      } else {
        parsedData = response.body;
      }
    } else if (hasBodyProp && (response.body === undefined || response.body === null)) {
      parsedData = {};
    } else if (hasBodyProp) {
      parsedData = response.body;
    } else {
      parsedData = {};
    }

    // 确保 body 始终是字符串格式（用于向后兼容）
    const bodyToString =
      helpers.bodyToString ||
      function (body) {
        if (body == null) return '';
        if (typeof body === 'string') return body;
        if (typeof body === 'number' || typeof body === 'boolean') return String(body);
        try {
          return JSON.stringify(body);
        } catch (e) {
          return '';
        }
      };

    const bodySource = hasBodyProp ? response.body : hasBodyParsedProp ? response.bodyParsed : '';
    const bodyString = bodyToString(bodySource);

    const result = {
      status: response.status || 0,
      statusText: response.statusText || 'OK',
      headers,
      data: parsedData === undefined ? {} : parsedData,
      body: bodyString
    };

    if (hasBodyParsedProp) {
      result.bodyParsed = response.bodyParsed;
    }

    return result;
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
