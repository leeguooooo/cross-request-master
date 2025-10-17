/**
 * Logger Helper
 *
 * 提供安全的日志输出函数，用于在控制台中显示大响应体时进行截断。
 */

(function (root) {
  'use strict';

  var DEFAULT_MAX_BYTES = 10 * 1024; // 10KB
  var DEFAULT_HEAD_CHARS = 512;
  var DEFAULT_TAIL_CHARS = 512;

  function formatBytes(bytes) {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    if (bytes < 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function toStringValue(value) {
    if (value == null) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch (e) {
      try {
        return String(value);
      } catch (stringError) {
        return '[无法序列化的响应体]';
      }
    }
  }

  function countBytes(text) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text).length;
    }
    // 退化处理：按字符长度估算
    return text.length * 2;
  }

  /**
   * 构造安全的日志输出
   * @param {*} originalBody 原始响应体
   * @param {Object} [options]
   * @param {number} [options.maxBytes] 最大允许的字节数（默认 10KB）
   * @param {number} [options.headChars] 截断时保留的头部字符数
   * @param {number} [options.tailChars] 截断时保留的尾部字符数
   * @returns {*} 原始响应体或截断后的摘要对象
   */
  function safeLogResponse(originalBody, options) {
    var opts = options || {};
    var maxBytes = typeof opts.maxBytes === 'number' ? opts.maxBytes : DEFAULT_MAX_BYTES;
    var headChars = typeof opts.headChars === 'number' ? opts.headChars : DEFAULT_HEAD_CHARS;
    var tailChars = typeof opts.tailChars === 'number' ? opts.tailChars : DEFAULT_TAIL_CHARS;

    var textValue = toStringValue(originalBody);
    var bytes = countBytes(textValue);

    if (bytes <= maxBytes) {
      return originalBody;
    }

    var previewHead = textValue.slice(0, headChars);
    var previewTail = tailChars > 0 ? textValue.slice(-tailChars) : '';

    return {
      truncated: true,
      size: formatBytes(bytes),
      head: previewHead,
      tail: previewTail,
      hint: '响应体过大，已截断显示（查看 head/tail 字段获取片段）'
    };
  }

  root.CrossRequestHelpers = root.CrossRequestHelpers || {};
  root.CrossRequestHelpers.safeLogResponse = safeLogResponse;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      safeLogResponse: safeLogResponse,
      __private: {
        formatBytes: formatBytes,
        toStringValue: toStringValue
      }
    };
  }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
