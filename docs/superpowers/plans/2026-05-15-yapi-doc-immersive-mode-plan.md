# YApi 文档型接口沉浸式查看模式 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — this is being executed directly in the controlling session by user directive.

**Goal:** 浏览器扩展自动识别 docs-sync HTML 文档并隐藏 YApi 接口详情页的"基本信息 / 请求参数 / 返回数据"三块，让"备注"内容（iframe 文档）独占视野，右上角浮动"退出沉浸式"按钮可手动切回。

**Architecture:** 把判定逻辑（`isImmersiveDoc`）和 DOM 打标逻辑（`tagSections`）抽到 `src/helpers/yapi-doc-immersive.js`（IIFE + window 命名空间 + CommonJS 双出口模式，与现有 helpers 一致）。`manifest.json` 把这个文件加进 `content_scripts.js` 数组让它和 `content-script.js` 共享 isolated world。`content-script.js` 里加 `immersiveCache` 状态 + `checkImmersive` 主循环 + 浮层按钮 + CSS 注入，挂到现有 `tick()` 末尾。

**Tech Stack:** Chrome Extension Manifest v3 / 原生 JS / jest + jsdom 单测 / ESLint。

**Spec:** `docs/superpowers/specs/2026-05-15-yapi-doc-immersive-mode-design.md` (commit `10584f7`)

---

## File Structure

**新增**：
- `src/helpers/yapi-doc-immersive.js` — `isImmersiveDoc`、`tagSections`、`SECTION_LABELS` 三个导出（IIFE + window 命名空间 + CJS 双出口）
- `tests/yapi-doc-immersive.test.js` — 上述纯函数 jsdom 单测

**修改**：
- `manifest.json` — `content_scripts.js` 列表前置 `src/helpers/yapi-doc-immersive.js`；version `4.5.18` → `4.5.19`
- `content-script.js` — 在文件末尾或合适位置加 `immersiveCache` / `checkImmersive` / `enterImmersive` / `exitImmersive` / `ensureExitButton` / `removeExitButton`；`ensureStyle()` 注入沉浸态 CSS；`tick()` 挂载新逻辑
- `CHANGELOG.md` 或 README — 加 4.5.19 changelog 段

---

### Task 1: 抽 `isImmersiveDoc` + 测试（TDD）

**Files:**
- Create: `src/helpers/yapi-doc-immersive.js`
- Create: `tests/yapi-doc-immersive.test.js`

- [ ] **Step 1: 写测试**

`tests/yapi-doc-immersive.test.js`:

```js
const { isImmersiveDoc } = require('../src/helpers/yapi-doc-immersive.js');

describe('isImmersiveDoc', () => {
  test('desc 以 <iframe srcdoc= 开头 → true', () => {
    expect(isImmersiveDoc({ desc: '<iframe srcdoc="x" sandbox="allow-same-origin"></iframe>' })).toBe(true);
  });
  test('desc 前面有空白也能识别', () => {
    expect(isImmersiveDoc({ desc: '   \n<iframe srcdoc="x"></iframe>' })).toBe(true);
  });
  test('desc 含 srcdoc = 空格变体也能识别', () => {
    expect(isImmersiveDoc({ desc: '<iframe srcdoc = "x"></iframe>' })).toBe(true);
  });
  test('markdown 以警告横幅开头 → true', () => {
    expect(isImmersiveDoc({ markdown: '> ⚠️ 此文档由 HTML 源生成，请勿编辑\n\n```html\n<p>x</p>\n```' })).toBe(true);
  });
  test('markdown 多空格变体', () => {
    expect(isImmersiveDoc({ markdown: '>  ⚠️  此文档由  HTML  源生成 — 详情' })).toBe(true);
  });
  test('两者都不匹配 → false', () => {
    expect(isImmersiveDoc({ desc: '<div>hi</div>', markdown: '# H1\nbody' })).toBe(false);
  });
  test('data = null → false', () => {
    expect(isImmersiveDoc(null)).toBe(false);
  });
  test('data = {} → false', () => {
    expect(isImmersiveDoc({})).toBe(false);
  });
  test('desc 非字符串（number）→ false 不抛错', () => {
    expect(isImmersiveDoc({ desc: 123 })).toBe(false);
  });
  test('desc 是 null（YApi 偶尔返回 null） → false', () => {
    expect(isImmersiveDoc({ desc: null, markdown: null })).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm test -- --testPathPatterns=yapi-doc-immersive
```

Expected: Cannot find module `../src/helpers/yapi-doc-immersive.js`.

- [ ] **Step 3: 实现**

`src/helpers/yapi-doc-immersive.js`:

```js
/**
 * YApi 文档型接口沉浸式查看模式 — 判定与 DOM 打标
 *
 * isImmersiveDoc(data): 判定当前 YApi 接口是否为 docs-sync 生成的 HTML 文档
 * tagSections(document): 给 YApi 区块 h2 + 内容元素打 data-crm-section 属性，
 *                       供 CSS 选择器隐藏使用
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
      while (sib && !(sib.tagName === 'H2' && sib.classList && sib.classList.contains('interface-title'))) {
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
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test -- --testPathPatterns=yapi-doc-immersive
```

Expected: 10 isImmersiveDoc tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/yapi-doc-immersive.js tests/yapi-doc-immersive.test.js
git commit -m "feat(ext): isImmersiveDoc 判定 docs-sync 文档型接口"
```

---

### Task 2: `tagSections` jsdom 测试 + 兜底验证

**Files:**
- Modify: `tests/yapi-doc-immersive.test.js`

- [ ] **Step 1: 写测试**

追加到 `tests/yapi-doc-immersive.test.js`：

```js
const { tagSections } = require('../src/helpers/yapi-doc-immersive.js');

function makeDom(html) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return dom.window.document;
}

describe('tagSections', () => {
  test('平级兄弟：h2 + 内容兄弟节点都被打标', () => {
    const doc = makeDom(`
      <div>
        <h2 class="interface-title">基本信息</h2>
        <div id="basic-fields">fields</div>
        <p id="basic-extra">extra</p>
        <h2 class="interface-title">请求参数</h2>
        <div id="req-body">req</div>
        <h2 class="interface-title">备注</h2>
        <div id="notes-body">notes</div>
      </div>
    `);
    tagSections(doc);
    expect(doc.querySelector('h2.interface-title[data-crm-section="basic"]')).toBeTruthy();
    expect(doc.getElementById('basic-fields').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('basic-extra').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('req-body').dataset.crmSection).toBe('req');
    expect(doc.getElementById('notes-body').dataset.crmSection).toBe('notes');
  });

  test('嵌套：每个 section 容器只含一个 h2 → section 自身被打标', () => {
    const doc = makeDom(`
      <section id="s-basic">
        <h2 class="interface-title">基本信息</h2>
        <div>fields</div>
      </section>
      <section id="s-req">
        <h2 class="interface-title">请求参数</h2>
        <div>req</div>
      </section>
    `);
    tagSections(doc);
    expect(doc.getElementById('s-basic').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('s-req').dataset.crmSection).toBe('req');
  });

  test('深层嵌套：多层只含本 h2 的祖先都被打标', () => {
    const doc = makeDom(`
      <div id="outer">
        <div id="middle">
          <h2 class="interface-title">基本信息</h2>
          <p>x</p>
        </div>
      </div>
    `);
    tagSections(doc);
    expect(doc.getElementById('middle').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('outer').dataset.crmSection).toBe('basic');
  });

  test('祖先含多个 h2 时停止向上打标', () => {
    const doc = makeDom(`
      <div id="all-in-one">
        <h2 class="interface-title">基本信息</h2>
        <h2 class="interface-title">请求参数</h2>
      </div>
    `);
    tagSections(doc);
    // h2 自身被标，外层 div 不被标（含两个 h2）
    expect(doc.getElementById('all-in-one').dataset.crmSection).toBeUndefined();
    const h2s = doc.querySelectorAll('h2.interface-title');
    expect(h2s[0].dataset.crmSection).toBe('basic');
    expect(h2s[1].dataset.crmSection).toBe('req');
  });

  test('h2 文本不在 SECTION_LABELS：不打标', () => {
    const doc = makeDom(`<h2 class="interface-title">示例代码</h2><div>x</div>`);
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBeUndefined();
  });

  test('幂等：同一 DOM 跑两次结果一样', () => {
    const doc = makeDom(`
      <h2 class="interface-title">基本信息</h2><div id="x">fields</div>
      <h2 class="interface-title">备注</h2><div>notes</div>
    `);
    tagSections(doc);
    const first = doc.getElementById('x').dataset.crmSection;
    tagSections(doc);
    const second = doc.getElementById('x').dataset.crmSection;
    expect(first).toBe('basic');
    expect(second).toBe('basic');
  });

  test('已打标但 h2 文本变化：旧标记被清理', () => {
    const doc = makeDom(`<h2 class="interface-title">基本信息</h2>`);
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBe('basic');
    // 模拟 YApi 更新了标题文本
    doc.querySelector('h2').textContent = '示例代码';
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBeUndefined();
  });

  test('"备注" 被打标但 CSS 不会隐藏（CSS 选择器只针对 basic/req/res）', () => {
    const doc = makeDom(`<h2 class="interface-title">备注</h2><div id="n">notes</div>`);
    tagSections(doc);
    expect(doc.getElementById('n').dataset.crmSection).toBe('notes');
    // 这是 spec 期望：notes 标记但 CSS 选择器不在 hide 列表里
  });
});
```

- [ ] **Step 2: 安装 jsdom（如果 jest-environment-jsdom 不带）**

```bash
pnpm test -- --testPathPatterns=yapi-doc-immersive 2>&1 | head -20
```

如果报 "Cannot find module 'jsdom'"，安装：

```bash
pnpm add -D jsdom
```

但 jest-environment-jsdom 30 通常自带 jsdom，应该不用单独装。直接跑：

- [ ] **Step 3: 跑测试**

```bash
pnpm test -- --testPathPatterns=yapi-doc-immersive
```

Expected: 18 passing（10 isImmersiveDoc + 8 tagSections）。

- [ ] **Step 4: Commit**

```bash
git add tests/yapi-doc-immersive.test.js
git commit -m "test(ext): tagSections 双策略覆盖（兄弟链 + 祖先链 + 边界）"
```

---

### Task 3: 在 manifest 把 helper 文件加进 content_scripts

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: 找到 content_scripts**

`manifest.json` 现在长这样：

```json
"content_scripts": [
  {
    "matches": ["http://*/*", "https://*/*"],
    "js": ["content-script.js"]
  }
]
```

- [ ] **Step 2: 修改**

```json
"content_scripts": [
  {
    "matches": ["http://*/*", "https://*/*"],
    "js": ["src/helpers/yapi-doc-immersive.js", "content-script.js"]
  }
]
```

helper 必须放在 `content-script.js` 前面，确保 `window.YapiDocImmersive` 在 content-script 跑时已存在。

- [ ] **Step 3: 跑 lint 确认 manifest 仍合法 JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"  # 报错=失败
```

Expected: 无输出（语法合法）。

- [ ] **Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat(ext): manifest 装入 yapi-doc-immersive helper"
```

---

### Task 4: 在 content-script.js 中接入沉浸式逻辑

**Files:**
- Modify: `content-script.js`

- [ ] **Step 1: 找现有 ensureStyle 函数追加 CSS**

定位 `ensureStyle` 函数（line ~118-138 区域），在 style 块末尾追加 CSS。

```js
// 在 ensureStyle 的 style.textContent 字符串末尾追加：
body.crm-doc-immersive [data-crm-section="basic"],
body.crm-doc-immersive [data-crm-section="req"],
body.crm-doc-immersive [data-crm-section="res"] {
  display: none !important;
}
#crm-exit-immersive {
  position: fixed; top: 16px; right: 16px;
  z-index: 2147483647;
  padding: 6px 12px;
  background: #fff; border: 1px solid #d0d7de;
  border-radius: 6px; font-size: 12px; cursor: pointer;
  color: #24292f;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
#crm-exit-immersive:hover { background: #f6f8fa; }
```

- [ ] **Step 2: 加沉浸态状态管理 + 函数**

在 `mountButtons` 函数定义之前（line ~1748 之前），加入：

```js
const IMMERSIVE_BTN_ID = 'crm-exit-immersive';
const IMMERSIVE_CLASS = 'crm-doc-immersive';
const immersiveCache = new Map();      // apiId -> 'yes' | 'no' | 'exitedByUser'
const immersiveInflight = new Set();    // apiId in-flight

const tagSectionsIfPresent = () => {
  if (typeof window.YapiDocImmersive !== 'object' || !window.YapiDocImmersive) return;
  try {
    window.YapiDocImmersive.tagSections(document);
  } catch (e) {
    // 容错：DOM 还没 ready 等情况
  }
};

const enterImmersive = (apiId) => {
  document.body.classList.add(IMMERSIVE_CLASS);
  ensureExitImmersiveBtn(apiId);
};

const exitImmersive = (apiId) => {
  document.body.classList.remove(IMMERSIVE_CLASS);
  removeExitImmersiveBtn();
  if (apiId) immersiveCache.set(apiId, 'exitedByUser');
};

const ensureExitImmersiveBtn = (apiId) => {
  if (document.getElementById(IMMERSIVE_BTN_ID)) return;
  const btn = document.createElement('button');
  btn.id = IMMERSIVE_BTN_ID;
  btn.type = 'button';
  btn.textContent = '↩ 退出沉浸式';
  btn.addEventListener('click', () => exitImmersive(apiId));
  document.body.appendChild(btn);
};

const removeExitImmersiveBtn = () => {
  const btn = document.getElementById(IMMERSIVE_BTN_ID);
  if (btn) btn.remove();
};

const checkImmersive = async () => {
  const route = parseYapiInterfaceRoute();
  if (!route) {
    if (document.body.classList.contains(IMMERSIVE_CLASS)) {
      document.body.classList.remove(IMMERSIVE_CLASS);
      removeExitImmersiveBtn();
    }
    return;
  }
  const apiId = route.apiId;
  const cached = immersiveCache.get(apiId);
  if (cached === 'exitedByUser') return;
  if (cached === 'yes') {
    tagSectionsIfPresent();
    enterImmersive(apiId);
    return;
  }
  if (cached === 'no') return;
  if (immersiveInflight.has(apiId)) return;

  if (typeof window.YapiDocImmersive !== 'object' || !window.YapiDocImmersive.isImmersiveDoc) return;

  immersiveInflight.add(apiId);
  try {
    const data = await fetchInterfaceDetail(location.origin, apiId);
    // 竞态防护
    const currentRoute = parseYapiInterfaceRoute();
    if (!currentRoute || currentRoute.apiId !== apiId) return;

    const isDoc = window.YapiDocImmersive.isImmersiveDoc(data);
    immersiveCache.set(apiId, isDoc ? 'yes' : 'no');
    if (isDoc) {
      tagSectionsIfPresent();
      enterImmersive(apiId);
    }
  } catch (e) {
    // 网络失败：不写 cache，下次 tick 重试
  } finally {
    immersiveInflight.delete(apiId);
  }
};
```

- [ ] **Step 3: 挂载到 tick**

定位 `tick` 函数（line ~1798）。在 URL 变化时清理沉浸态，并在 tick 末尾调用 `checkImmersive`。

```js
const tick = () => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    const old = document.getElementById(BTN_GROUP_ID);
    if (old) old.remove();
    // URL 变化：清理上一文档的沉浸态
    document.body.classList.remove(IMMERSIVE_CLASS);
    removeExitImmersiveBtn();
  }
  mountButtons();
  mountPathParamButton();
  mountHeaderButton();
  ensureSendClickIntercept();
  tagSectionsIfPresent();   // 幂等打标
  checkImmersive();          // async fire-and-forget
};
```

- [ ] **Step 4: lint 通过**

```bash
pnpm lint
```

Expected: 无错误（最多有现有的警告）。

- [ ] **Step 5: jest 全套通过**

```bash
pnpm test 2>&1 | tail -15
```

Expected: 全部测试通过，包含新的 18 个。

- [ ] **Step 6: Commit**

```bash
git add content-script.js
git commit -m "feat(ext): content-script 接入沉浸式查看模式（CSS + 检测主循环）"
```

---

### Task 5: bump manifest version + changelog

**Files:**
- Modify: `manifest.json`
- Modify: `CHANGELOG.md` 或 `README.md`（看现有写法）
- Modify: `package.json`（version 字段也要对齐）

- [ ] **Step 1: 找版本字段**

```bash
grep -n '"version"' manifest.json package.json
```

- [ ] **Step 2: 改 manifest version 4.5.18 → 4.5.19**

```bash
node -e "const fs=require('fs');const p='manifest.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='4.5.19';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
```

- [ ] **Step 3: 改 package.json version 同步**

```bash
node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='4.5.19';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
```

- [ ] **Step 4: changelog**

如果有 `CHANGELOG.md`：在顶部加：

```markdown
## 4.5.19 - 2026-05-15

### Features
- YApi 文档型接口（通过 `@leeguoo/yapi-mcp` docs-sync 0.6.1+ 推上来的 HTML 文档）打开时自动进入"沉浸式查看模式"：隐藏"基本信息 / 请求参数 / 返回数据"三个区块，让备注里的 iframe 文档独占视野。右上角浮动"↩ 退出沉浸式"按钮可手动切回完整视图，本会话内不再自动重入；刷新页面重置。
```

如果没有 CHANGELOG.md，看 README.md 是否有"版本日志"段，加在那里。否则新建 CHANGELOG.md。

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json CHANGELOG.md README.md  # 实际改了的
git commit -m "chore(ext): 4.5.19 — 文档型接口沉浸式查看模式"
```

---

### Task 6: 最终验收

**Files:** 无

- [ ] **Step 1: lint + test**

```bash
pnpm lint && pnpm test 2>&1 | tail -10
```

Expected: 全绿。

- [ ] **Step 2: git status 确认干净**

```bash
git status -sb
```

Expected: clean working tree（仅 `.omx/` 等已知未追踪）。

- [ ] **Step 3: 推 origin**

```bash
git push origin main
```

- [ ] **Step 4: 提醒用户做的手动验证**

留下一段验证指引：
1. 在 Chrome 扩展管理页 "重新加载" 或临时禁用再启用扩展
2. 打开 docs-sync 0.6.1 推上去的 HTML 文档接口 URL → 应自动隐"基本信息 / 请求参数 / 返回数据"三块，右上角浮"↩ 退出沉浸式"
3. 点退出 → 三块出现，浮层消失；同一 tab 切走再切回 → 不再自动重入（设计意图）
4. 刷新页面 → 重新自动进入沉浸式
5. 打开**非文档接口**（普通 GET /xxx 有 req/res schema 的）→ 行为完全不变，没有沉浸态
6. 如果某文档的"基本信息 / 请求参数 / 返回数据"没全隐 → 说明 YApi 实际 DOM 是 spec §7 标注的"混合结构"，需要补 sibling traversal 逻辑

---

## 风险与回滚

| 风险 | 检测 | 回滚 |
|------|------|------|
| `window.YapiDocImmersive` 未定义（manifest 加载顺序错） | content-script.js 里 `typeof window.YapiDocImmersive !== 'object'` 守卫 → 沉默退化，无沉浸态但页面正常 | 检查 manifest.json content_scripts.js 数组顺序 |
| jsdom 在 jest 环境里 require 不到 | Task 2 Step 2 已写明 `pnpm add -D jsdom` 兜底 | 装上即可 |
| CSS 选择器跟 YApi 自家样式打架 | `display: none !important` 优先级足够；浮层 z-index 2147483647 | 调整选择器特异性 |
| 浏览器手测发现"混合 DOM"结构 | Task 6 Step 4 验证 6 明示 | 补 sibling traversal（不在本期计划） |

## 不在本计划范围

- chrome.storage 持久化退出偏好
- 识别非 docs-sync 文档
- 沉浸态可配置
- Chrome Web Store 上架（按现有 `build-extension.sh` 流程，独立操作）
