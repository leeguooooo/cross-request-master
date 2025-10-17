/**
 * Body Parser Helper
 *
 * 处理响应体的解析和字符串转换
 * 特别注意保留 falsy 值（0, false, null, ""）
 */

(function (window) {
  'use strict';

  /**
   * 将响应体转换为字符串，保留所有合法的 JSON 标量值
   * @param {*} body - 响应体（可能是对象、字符串或标量）
   * @returns {string} 字符串表示
   *
   * @example
   * bodyToString(0) // => "0" (不是 "")
   * bodyToString(false) // => "false" (不是 "")
   * bodyToString(null) // => "" (null 转为空字符串)
   * bodyToString("") // => "" (保留空字符串)
   * bodyToString({ a: 1 }) // => '{"a":1}'
   */
  function bodyToString(body) {
    // null 和 undefined 转为空字符串
    if (body == null) {
      return '';
    }

    // 字符串直接返回
    if (typeof body === 'string') {
      return body;
    }

    // 数字和布尔值：使用 String() 转换
    // 这样可以保留 0 和 false 的正确表示
    if (typeof body === 'number' || typeof body === 'boolean') {
      return String(body);
    }

    // 对象和数组：JSON 序列化
    try {
      return JSON.stringify(body);
    } catch (e) {
      console.error('[bodyToString] Failed to stringify body:', e);
      return '';
    }
  }

  // 导出到 window 对象，供其他脚本使用
  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.bodyToString = bodyToString;

  // 支持 CommonJS 用于测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bodyToString };
  }
})(typeof window !== 'undefined' ? window : global);

