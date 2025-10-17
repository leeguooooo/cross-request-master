/**
 * Query String Helper
 *
 * 将对象参数转换为 URL 查询字符串
 * 支持基本类型、数组、嵌套对象
 */

(function (window) {
  'use strict';

  /**
   * 将参数对象转换为查询字符串
   * @param {Object} params - 参数对象
   * @returns {string} 查询字符串 (不包含 '?')
   *
   * @example
   * buildQueryString({ name: 'test', id: 1 })
   * // => 'name=test&id=1'
   *
   * buildQueryString({ ids: [1, 2, 3] })
   * // => 'ids=1&ids=2&ids=3'
   *
   * buildQueryString({ filter: { status: 'active' } })
   * // => 'filter=%7B%22status%22%3A%22active%22%7D' (JSON encoded)
   */
  function buildQueryString(params) {
    if (!params || typeof params !== 'object') {
      return '';
    }

    const pairs = [];

    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const value = params[key];

        // 跳过 undefined 和 null
        if (value !== undefined && value !== null) {
          // 处理数组：转换为多个同名参数 (key=val1&key=val2)
          if (Array.isArray(value)) {
            value.forEach((item) => {
              pairs.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(item)}`
              );
            });
          }
          // 处理嵌套对象：JSON 序列化
          else if (typeof value === 'object') {
            pairs.push(
              `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`
            );
          }
          // 处理基本类型
          else {
            pairs.push(
              `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            );
          }
        }
      }
    }

    return pairs.length > 0 ? pairs.join('&') : '';
  }

  // 导出到 window 对象，供其他脚本使用
  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.buildQueryString = buildQueryString;

  // 支持 CommonJS 用于测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildQueryString };
  }
})(typeof window !== 'undefined' ? window : global);

