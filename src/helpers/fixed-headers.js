/**
 * Fixed Headers Helper
 *
 * 处理固定 Header 的存储键、数据结构归一化与合并。
 */

(function (root) {
  'use strict';

  const STORAGE_PREFIX = '__crm_fixed_headers_';

  function buildFixedHeaderStorageKey(host) {
    let target = host;

    if (target == null) {
      try {
        target =
          root && root.location && root.location.host
            ? root.location.host
            : root && root.location && root.location.hostname
            ? root.location.hostname
            : '';
      } catch (e) {
        target = '';
      }
    }

    const safeHost = String(target || '').trim() || 'unknown';
    return `${STORAGE_PREFIX}${safeHost}`;
  }

  function normalizeHeaderEntries(input) {
    let rawList = [];

    if (!input) return [];

    if (Array.isArray(input)) {
      rawList = input;
    } else if (typeof input === 'object') {
      if (Array.isArray(input.headers)) {
        rawList = input.headers;
      } else {
        rawList = Object.entries(input).map(([key, value]) => ({ key, value }));
      }
    } else {
      return [];
    }

    const entries = [];

    rawList.forEach((item) => {
      if (!item) return;

      if (Array.isArray(item)) {
        if (item.length < 2) return;
        entries.push({ key: item[0], value: item[1] });
        return;
      }

      if (typeof item === 'object') {
        const key = item.key || item.name || item.header || '';
        let value = '';
        if (Object.prototype.hasOwnProperty.call(item, 'value')) {
          value = item.value;
        } else if (Object.prototype.hasOwnProperty.call(item, 'val')) {
          value = item.val;
        }
        entries.push({ key, value });
      }
    });

    return entries
      .map(({ key, value }) => ({
        key: String(key == null ? '' : key).trim(),
        value: value == null ? '' : String(value)
      }))
      .filter((entry) => entry.key);
  }

  function mergeFixedHeaders(headers, entries, options) {
    const base =
      headers && typeof headers === 'object' && !Array.isArray(headers) ? { ...headers } : {};
    const normalized = normalizeHeaderEntries(entries);
    if (!normalized.length) return base;

    const preferExisting =
      options && options.preferExisting !== undefined ? options.preferExisting : true;
    const existingKeys = new Set(Object.keys(base).map((key) => key.toLowerCase()));

    normalized.forEach(({ key, value }) => {
      const lower = key.toLowerCase();
      if (preferExisting && existingKeys.has(lower)) return;

      if (!preferExisting && existingKeys.has(lower)) {
        const existingKey = Object.keys(base).find((k) => k.toLowerCase() === lower);
        if (existingKey) delete base[existingKey];
      }

      base[key] = value;
      existingKeys.add(lower);
    });

    return base;
  }

  root.CrossRequestHelpers = root.CrossRequestHelpers || {};
  root.CrossRequestHelpers.buildFixedHeaderStorageKey = buildFixedHeaderStorageKey;
  root.CrossRequestHelpers.normalizeHeaderEntries = normalizeHeaderEntries;
  root.CrossRequestHelpers.mergeFixedHeaders = mergeFixedHeaders;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildFixedHeaderStorageKey,
      normalizeHeaderEntries,
      mergeFixedHeaders
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
