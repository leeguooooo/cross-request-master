/**
 * YApi 文档型接口沉浸式查看模式 — 判定与 DOM 打标
 *
 * isImmersiveDoc(data): 判定当前 YApi 接口是否为 docs-sync 生成的 HTML 文档
 * tagSections(document): 给 YApi 区块 h2 + 内容元素打 data-crm-section 属性，
 *                       供 CSS 选择器隐藏使用
 *
 * 设计参考：docs/superpowers/specs/2026-05-15-yapi-doc-immersive-mode-design.md
 */

(function (windowRef) {
  'use strict';

  const SECTION_LABELS = [
    { text: '基本信息', kind: 'basic' },
    { text: '请求参数', kind: 'req' },
    { text: '返回数据', kind: 'res' },
    { text: '响应数据', kind: 'res' },
    { text: '备注', kind: 'notes' },
  ];

  function isImmersiveDoc(data) {
    if (!data || typeof data !== 'object') return false;
    const desc = String(data.desc == null ? '' : data.desc).trim();
    const markdown = String(data.markdown == null ? '' : data.markdown).trim();
    if (/^<iframe\s+srcdoc\s*=/.test(desc)) return true;
    if (/^>\s*⚠️\s*此文档由\s*HTML\s*源生成/.test(markdown)) return true;
    return false;
  }

  function tagSections(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return;
    const titles = Array.from(root.querySelectorAll('h2.interface-title'));
    titles.forEach((h2) => {
      const text = (h2.textContent || '').trim();
      const match = SECTION_LABELS.find((s) => text.includes(s.text));
      if (!match) {
        if (h2.dataset && h2.dataset.crmSection) delete h2.dataset.crmSection;
        return;
      }
      const kind = match.kind;
      if (h2.dataset.crmSection !== kind) h2.dataset.crmSection = kind;

      // A. 平级兄弟链
      let sib = h2.nextElementSibling;
      while (
        sib &&
        !(sib.tagName === 'H2' && sib.classList && sib.classList.contains('interface-title'))
      ) {
        if (sib.dataset && sib.dataset.crmSection !== kind) sib.dataset.crmSection = kind;
        sib = sib.nextElementSibling;
      }

      // B. 向上找"只含本 h2"的祖先
      let p = h2.parentElement;
      while (p && p !== root.body && p !== root.documentElement) {
        const innerTitles = p.querySelectorAll('h2.interface-title');
        if (innerTitles.length === 1 && innerTitles[0] === h2) {
          if (p.dataset && p.dataset.crmSection !== kind) p.dataset.crmSection = kind;
          p = p.parentElement;
        } else {
          break;
        }
      }
    });
  }

  // 浏览器：暴露到 window 命名空间
  if (windowRef && typeof windowRef === 'object') {
    windowRef.YapiDocImmersive = windowRef.YapiDocImmersive || {};
    windowRef.YapiDocImmersive.isImmersiveDoc = isImmersiveDoc;
    windowRef.YapiDocImmersive.tagSections = tagSections;
    windowRef.YapiDocImmersive.SECTION_LABELS = SECTION_LABELS;
  }

  // Node/CommonJS：导出供测试用
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isImmersiveDoc, tagSections, SECTION_LABELS };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
