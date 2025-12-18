/**
 * Request Headers Helper
 *
 * 处理跨域请求的 header：移除 fetch 不支持设置的受限请求头
 */

(function (root) {
  'use strict';

  function sanitizeRequestHeaders(headers = {}) {
    const forbidden = new Set([
      'accept-encoding',
      'connection',
      'content-length',
      'cookie',
      'host',
      'origin',
      'referer',
      'user-agent'
    ]);

    const sanitizedHeaders = {};
    const droppedHeaders = [];

    Object.entries(headers || {}).forEach(([rawKey, value]) => {
      const key = String(rawKey || '').trim();
      if (!key) return;

      const lowerKey = key.toLowerCase();
      if (forbidden.has(lowerKey)) {
        if (lowerKey === 'origin' && typeof value === 'string') {
          const origin = value.trim();
          if (
            origin.startsWith('chrome-extension://') ||
            origin.startsWith('moz-extension://') ||
            origin.startsWith('safari-extension://')
          ) {
            droppedHeaders.push(`${key}=${origin}`);
            return;
          }
        }
        droppedHeaders.push(key);
        return;
      }

      sanitizedHeaders[key] = value;
    });

    return { sanitizedHeaders, droppedHeaders };
  }

  root.CrossRequestHelpers = root.CrossRequestHelpers || {};
  root.CrossRequestHelpers.sanitizeRequestHeaders = sanitizeRequestHeaders;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sanitizeRequestHeaders };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);

