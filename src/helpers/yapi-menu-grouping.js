/**
 * YApi 左侧菜单按月份虚拟分级
 *
 * 纯函数 + DOM 构造 helper，供 content-script 调用与单测共用。
 * 设计参考：docs/superpowers/specs/2026-05-15-yapi-menu-virtual-grouping-design.md
 */

(function (windowRef) {
  'use strict';

  const GROUPING_MIN_INTERFACES = 5;

  // 抓 YYYY-MM 或 YYYY-MM-DD（中间必须 `-`，避免 `v2026.04` 误伤）；
  // 年份 2000-2999、月份 01-12
  const MONTH_RE = /(20\d{2})-(0[1-9]|1[0-2])(?:-\d{1,2})?/;

  function extractMonth(title) {
    if (title == null) return null;
    const s = String(title);
    const m = MONTH_RE.exec(s);
    if (!m) return null;
    return `${m[1]}-${m[2]}`;
  }

  /**
   * 把 [{ li, title }] 数组按月份分组。
   * 返回 [{ month, items }]，month desc，null 组（无日期）在最后。
   */
  function groupByMonth(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const map = new Map();
    items.forEach((it) => {
      const month = extractMonth(it.title);
      if (!map.has(month)) map.set(month, []);
      map.get(month).push(it);
    });
    const groups = [...map.entries()].map(([month, gItems]) => ({ month, items: gItems }));
    groups.sort((a, b) => {
      if (a.month === b.month) return 0;
      if (a.month === null) return 1;   // null 最后
      if (b.month === null) return -1;
      return a.month < b.month ? 1 : -1; // 月份倒序
    });
    return groups;
  }

  /**
   * 返回最新非空月份；如果 groups 为空或只有 null 组，返回 null。
   */
  function pickDefaultExpandedMonth(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    for (const g of groups) {
      if (g.month) return g.month;
    }
    return null;
  }

  /**
   * 从 cat li 推导稳定 catKey 的尾段（不含 projectId 前缀）。
   * 优先 data-cat-id；退化 .ant-tree-title textContent + 剥离尾部计数后缀。
   */
  function deriveCatKey(catLi) {
    if (!catLi) return '';
    const dataCatId = catLi.dataset?.catId || catLi.getAttribute?.('data-cat-id');
    if (dataCatId) return String(dataCatId);
    const titleEl = catLi.querySelector?.('.ant-tree-title');
    const raw = (titleEl?.textContent || '').trim();
    return raw
      .replace(/\s*[(（]\s*\d+\s*[)）]\s*$/, '')
      .replace(/\s+\d+\s*(?:项|条)?$/, '')
      .trim()
      .slice(0, 50);
  }

  /**
   * 构造 month header li。包含三个 span，所有关键属性齐备，供属性选择器定位。
   * 不挂 click handler — 那是调用方的事。
   */
  function buildHeaderLi(month, count, catKey, collapsed) {
    const doc = (windowRef && windowRef.document) || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('buildHeaderLi requires a document');
    const li = doc.createElement('li');
    li.className = 'crm-month-header';
    li.dataset.crmCatKey = String(catKey);
    li.dataset.crmMonth = String(month);
    li.dataset.crmCollapsed = String(Boolean(collapsed));

    const toggle = doc.createElement('span');
    toggle.className = 'crm-month-toggle';
    const label = doc.createElement('span');
    label.className = 'crm-month-label';
    label.textContent = String(month);
    const countEl = doc.createElement('span');
    countEl.className = 'crm-month-count';
    countEl.textContent = String(count);

    li.appendChild(toggle);
    li.appendChild(label);
    li.appendChild(countEl);
    return li;
  }

  const api = {
    extractMonth,
    groupByMonth,
    pickDefaultExpandedMonth,
    deriveCatKey,
    buildHeaderLi,
    GROUPING_MIN_INTERFACES,
  };

  if (windowRef && typeof windowRef === 'object') {
    windowRef.YapiMenuGrouping = windowRef.YapiMenuGrouping || {};
    Object.assign(windowRef.YapiMenuGrouping, api);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
