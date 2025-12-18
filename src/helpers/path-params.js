/**
 * URL Template Helpers
 *
 * 支持从 URL 中提取 {param} 占位符，并用实际值替换。
 */

(function (window) {
  'use strict';

  function extractUrlPlaceholders(url) {
    if (typeof url !== 'string') return [];
    if (!url.includes('{')) return [];

    const re = /\{([^}]+)\}/g;
    const seen = new Set();
    const names = [];
    let m;

    while ((m = re.exec(url))) {
      const name = String(m[1] || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }

    return names;
  }

  function applyUrlPlaceholders(url, values, options) {
    if (typeof url !== 'string') return url;
    if (!url.includes('{')) return url;
    if (!values || typeof values !== 'object') return url;

    const encode = !!(options && options.encode === true);

    return url.replace(/\{([^}]+)\}/g, (match, rawName) => {
      const name = String(rawName || '').trim();
      if (!name) return match;
      if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
      const value = values[name];
      if (value === undefined || value === null) return match;
      const text = String(value);
      return encode ? encodeURIComponent(text) : text;
    });
  }

  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.extractUrlPlaceholders = extractUrlPlaceholders;
  window.CrossRequestHelpers.applyUrlPlaceholders = applyUrlPlaceholders;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractUrlPlaceholders, applyUrlPlaceholders };
  }
})(typeof window !== 'undefined' ? window : global);

