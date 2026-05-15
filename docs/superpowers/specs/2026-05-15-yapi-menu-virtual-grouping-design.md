# YApi 左侧菜单虚拟分级（按月份）设计文档

**日期**：2026-05-15
**目标包**：浏览器扩展 `cross-request-master`（manifest 4.5.21 → 4.6.0，semver minor 新功能）
**触发**：YApi 默认目录树只有"分类 → 接口"两层，docs-sync 推上来的文档堆在一个 cat 下越来越多。用扩展前端把同 cat 内的接口按标题中的月份自动分组成可折叠 header，让多月份文档目录看着像"多级"。

## 1. 背景与现状

`content-script.js` 注入到 YApi 接口详情页，已经在监听 SPA 路由 + DOM mutation（沉浸式查看模式 4.5.19+）。本期复用这一基础设施。

通过 Chrome MCP 直接探到的 DOM 结构：

- `<ul class="ant-tree interface-list">` — 顶层 tree（左侧菜单容器，width 294px）
- 顶层 8 个 `<li>`：`item-all-interface`、`interface-item-nav`（每个 cat 一个）
- 展开的 cat 下面是 `<ul class="ant-tree-child-tree ant-tree-child-tree-open">`，含 28 个子 `<li>`（接口节点）
- 每个接口 `<li>` 含可点击 link，标题来自 `.ant-tree-title` / `.ant-tree-node-content-wrapper`

接口标题模式样本（来自真实 pwtk YApi）：

```
客户问题反馈 · 2026-05-13 · 复盘与复现报告
AI 女友 · 2026-05-13 客户反馈处理结果
[2026-04-21] AI Girls -- /send-card 按卡话术 + card_key 内部解析设计
[2026-04-14] AI Girls -- 游戏卡片场景客户对接说明
[2026-03-31] AI Girls 主播配置指南
AI Girls YApi 知识库总册
```

可观察到月份信号 `[YYYY-MM-DD]` 或 `· YYYY-MM-DD ·` 普遍存在。

## 2. 目标与非目标

**目标**：

- 自动识别接口标题里的 YYYY-MM 年月信号，把同 cat 内同月份的接口聚合成可折叠 header。
- header 默认展开**最新月份**、折叠其它月份；localStorage 记忆用户折叠/展开状态。
- 仅对接口数 ≥ 5 的 cat 启用（避免给只有 1-2 个接口的 cat 加分组带来噪声）。
- 保留 YApi 原生 tree 的所有点击、路由、高亮、展开/收起行为；本功能纯叠加，不替换 / 改写既有节点。
- 抗 React 重渲染：MutationObserver + 幂等注入，被 React 干掉的 header 会自动重建。

**非目标**：

- 不做"按主题前缀"分组（用户已否决，看 brainstorm Q1）
- 不做用户自定义正则配置
- 不做多层嵌套（主题 + 月份）
- 不持久化"按月份分组的开关"（默认全开，仅折叠状态持久化）
- 不改 YApi 后端 / 不改 YApi 前端源码
- 不影响"全部接口" / "搜索结果" 视图

## 3. 关键设计决策（来自 brainstorming）

| 决策点 | 选项 | 理由 |
|--------|------|------|
| 分组维度 | **按月份自动** | docs-sync 文档命名约定里 `[YYYY-MM-DD]` 或 `· YYYY-MM-DD ·` 普遍存在；零配置；按主题需要主题白名单 |
| 启用门槛 | **cat 内接口数 ≥ 5** | 少于 5 个分组反而乱；零配置；自动判定 |
| 折叠 header 行为 | **可点击折叠 + 默认仅最新月展开** | 跟 YApi 原生 cat 一致的心智；解决"展开 cat 还是一堆"原问题 |
| 状态持久化 | **localStorage by catKey+month** | 简单；不需要 chrome.storage（不跨设备同步） |
| 实现策略 | **MutationObserver + 幂等 DOM 注入** | 抗 React 重渲染；保留 YApi tree 原生交互；不替换实现 |
| 月份提取 | **第一个 `YYYY-MM` 或 `YYYY-MM-DD` 匹配，含年/月范围校验** | 简单；防版本号 `v2026.04` 等误伤 |

## 4. 数据模型 / 状态

```ts
// content-script.js 模块作用域
const groupingDebounceTimer: number | null;       // setTimeout 句柄
const groupingObserver: MutationObserver | null;  // 唯一一个

// localStorage 持久化
type CollapseState = Record<string, boolean>;  // key: "<catKey>:<month>" → collapsed?
// e.g. { "383:文档:2026-04": true, "383:文档:2026-03": true }
```

`catKey` 构造：`<projectId>:<catTextSlug>`，projectId 从 `parseYapiInterfaceRoute()` 或 URL `/project/(\d+)/` 提取，catTextSlug 是 cat 的 textContent trim（如 "文档"）。

## 5. 模块边界

### 5.1 新文件 `src/helpers/yapi-menu-grouping.js`（IIFE + window 命名空间 + CJS 双出口）

```js
exports = {
  extractMonth(title): string | null,         // "2026-04" or null
  groupByMonth(items): GroupedResult,         // 排序好的分组结果
  pickDefaultExpandedMonth(groups): string,   // 最新非空月份
  // DOM 层（与 content-script 共用）
  GROUPING_MIN_INTERFACES: 5,
  buildHeaderLi(month, count, catKey, collapsed): HTMLLIElement,
};
```

### 5.2 `content-script.js` 新增 `initYapiMenuGrouping()`

```js
const GROUPING_DEBOUNCE_MS = 150;
const LS_KEY = 'crm-month-collapsed';

function getCollapseState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function setCollapseState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

function processGroupingForCat(catUl, catKey) { /* 见下文 */ }

function processAllExpandedCats() {
  const sublists = document.querySelectorAll('.ant-tree-child-tree.ant-tree-child-tree-open');
  sublists.forEach((ul) => {
    const catLi = ul.closest('li.interface-item-nav');
    if (!catLi) return;
    const projectId = (location.pathname.match(/\/project\/(\d+)\//) || [])[1] || '';
    const catText = (catLi.querySelector('.ant-tree-title, .ant-tree-node-content-wrapper')?.textContent || '').trim().slice(0, 30);
    const catKey = `${projectId}:${catText}`;
    processGroupingForCat(ul, catKey);
  });
}

function scheduleGroupingTick() {
  if (groupingDebounceTimer) return;
  groupingDebounceTimer = setTimeout(() => {
    groupingDebounceTimer = null;
    try { processAllExpandedCats(); } catch (_e) {}
  }, GROUPING_DEBOUNCE_MS);
}

function initYapiMenuGrouping() {
  const root = document.querySelector('.interface-list');
  if (!root) return false;
  if (groupingObserver) return true;
  groupingObserver = new MutationObserver(scheduleGroupingTick);
  groupingObserver.observe(root, { childList: true, subtree: true });
  scheduleGroupingTick();
  return true;
}
```

挂载到现有 `tick()` 函数末尾（line ~1900）：每次 tick 检查 `.interface-list` 是否就位，未就位则继续等待（observer 会在 dom-ready 时触发）。

### 5.3 `processGroupingForCat(catUl, catKey)`

```js
function processGroupingForCat(catUl, catKey) {
  // 抓出真接口 li（排除已注入的 month header）
  const allLis = [...catUl.children].filter(li => li.tagName === 'LI' && !li.classList.contains('crm-month-header'));
  if (allLis.length < GROUPING_MIN_INTERFACES) {
    // 不满足门槛 → 清理（如果之前注入过）
    [...catUl.querySelectorAll('.crm-month-header')].forEach(h => h.remove());
    allLis.forEach(li => { delete li.dataset.crmMonth; delete li.dataset.crmMonthHidden; });
    return;
  }

  const items = allLis.map(li => ({
    li,
    title: (li.querySelector('.ant-tree-title, .ant-tree-node-content-wrapper')?.textContent || '').trim(),
  }));
  const groups = groupByMonth(items);   // [{ month, items }] - month desc, null 最后
  const collapseState = getCollapseState();
  const latestMonth = pickDefaultExpandedMonth(groups);

  // 每组：定位组内第一个 li，header 插它前面；同组所有 li 加 data-crm-month
  groups.forEach(({ month, items: group }) => {
    if (!month) return;  // 无日期组不加 header（一堆没标记的也不分组，跟原状一致）
    const headerId = `crm-mh-${catKey}-${month}`;
    const firstLi = group[0].li;
    let header = catUl.querySelector(`#${CSS.escape(headerId)}`);
    const key = `${catKey}:${month}`;
    const isCollapsed = collapseState[key] !== undefined ? collapseState[key] : month !== latestMonth;
    if (!header) {
      header = buildHeaderLi(month, group.length, catKey, isCollapsed);
      header.id = headerId;
      header.addEventListener('click', () => toggleCollapse(catKey, month));
      catUl.insertBefore(header, firstLi);
    } else {
      // 已存在 → 更新计数（React 重新渲染时 li 数可能变）
      const countEl = header.querySelector('.crm-month-count');
      if (countEl) countEl.textContent = group.length;
      header.dataset.crmCollapsed = String(isCollapsed);
    }
    group.forEach(({ li }) => {
      if (li.dataset.crmMonth !== month) li.dataset.crmMonth = month;
      if (isCollapsed) li.dataset.crmMonthHidden = '1';
      else delete li.dataset.crmMonthHidden;
    });
  });
}

function toggleCollapse(catKey, month) {
  const state = getCollapseState();
  const key = `${catKey}:${month}`;
  state[key] = !state[key];   // 翻转
  setCollapseState(state);
  scheduleGroupingTick();     // 重渲染
}
```

### 5.4 CSS 注入到 `ensureStyle()`

```css
.crm-month-header {
  padding: 6px 16px;
  cursor: pointer;
  user-select: none;
  color: #586069;
  font-size: 12px;
  background: #fafbfc;
  border-top: 1px solid #eaecef;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.crm-month-header:hover { background: #f0f3f6; }
.crm-month-header .crm-month-toggle { display: inline-block; width: 12px; font-size: 10px; }
.crm-month-header .crm-month-label { flex: 1; }
.crm-month-header .crm-month-count { opacity: 0.6; }
.crm-month-header[data-crm-collapsed="true"] .crm-month-toggle::before { content: "▶"; }
.crm-month-header[data-crm-collapsed="false"] .crm-month-toggle::before { content: "▼"; }
.ant-tree-child-tree > li.ant-tree-treenode[data-crm-month-hidden] { display: none; }
```

### 5.5 manifest

把 `src/helpers/yapi-menu-grouping.js` 加进 `content_scripts.js` 数组（前置于 content-script.js）。

## 6. 文件级改造清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `src/helpers/yapi-menu-grouping.js` 新建 | `extractMonth` / `groupByMonth` / `pickDefaultExpandedMonth` / `buildHeaderLi` / `GROUPING_MIN_INTERFACES`；IIFE + window + CJS 双出口 |
| 2 | `tests/yapi-menu-grouping.test.js` 新建 | 纯函数 + DOM 注入（jsdom）单测，~20 用例 |
| 3 | `content-script.js` | `ensureStyle` 加 CSS；新加 `initYapiMenuGrouping`+`processAllExpandedCats`+`processGroupingForCat`+`toggleCollapse`+`getCollapseState`/`setCollapseState`；`tick()` 末尾调 `initYapiMenuGrouping()`（幂等 init 一次） |
| 4 | `manifest.json` | `content_scripts.js` 数组加 `src/helpers/yapi-menu-grouping.js`；version `4.5.21` → `4.6.0` |
| 5 | `package.json` | version 4.6.0 |
| 6 | `CHANGELOG.md` | 4.6.0 段 |

**diff 量估计**：~250 行净增（helper 80 + content-script 80 + 测试 90 + CSS/changelog/manifest 10）。

## 7. 错误处理 / 边界

| 场景 | 行为 |
|------|------|
| `.interface-list` 不存在 | observer 不挂、tick 重试；YApi 改 class 名则功能静默退化 |
| cat 下 < 5 接口 | 不分组、清理已注入 header |
| 所有接口都抽不到月份 | 不分组（只有"无日期"组无意义） |
| 月份提取误匹配版本号 `v2026.04` | regex 限制 `YYYY-MM` 中间是 `-`，不匹配 `.` 分隔；年范围 2000-2999 校验 |
| localStorage 不可写 / quota 满 | catch 静默；本会话有效，下次刷新丢失 |
| React 重渲染清掉 header | MutationObserver 触发 → debounce 后重新注入（幂等） |
| 用户点开新 cat | observer 子树 mutation → 自动处理 |
| 用户 collapse cat | child-tree-open 不存在 → 不处理 |
| 切换 project | catKey 含 projectId → 隔离；旧 project 的 collapse state 保留 |
| 一个 cat 既有带日期标题又有无日期标题 | 带日期的分组到对应月份；无日期的留在原位置（不动） |

## 8. 测试策略

### 单元测试 `tests/yapi-menu-grouping.test.js`（jsdom + jest）

**`extractMonth(title)`**：

| 输入 | 输出 |
|------|------|
| `"[2026-04-21] xxx"` | `"2026-04"` |
| `"· 2026-05-13 ·"` | `"2026-05"` |
| `"2026-3-1 ..."`（单位数） | `"2026-03"`（zero-pad 月份）or `null`（按 regex 决策；本期决策：要 0-pad，所以单位数不匹配 → null） |
| `"v2026.04 release"` | `null`（`.` 分隔不匹配） |
| `"2099-12-31"` | `"2099-12"` |
| `"1999-01"` | `null`（年范围下界） |
| `"3000-01"` | `null`（年范围上界） |
| `""` / `null` / `undefined` | `null` |
| `"AI Girls 知识库总册"` | `null` |

**`groupByMonth(items)`**：

| 输入 | 输出 |
|------|------|
| 空 | `[]` |
| 单月 | 1 组 |
| 多月混合 | 按 month desc 排序，null 组在最后 |
| 全 null | 1 组 month=null |

**`processGroupingForCat(catUl, catKey)`**（jsdom 构造 catUl）：

| 用例 | 期望 |
|------|------|
| 5 个同月 li | 1 个 header + 5 个 li 都 `data-crm-month` |
| 4 个 li | 不注入 header、不打 data-crm-month |
| 5 个跨 3 个月 li | 3 个 header（按月份倒序） |
| 5 个 li 全无日期 | 不注入 header |
| 同一 catUl 跑两次 | 幂等：header 数量不增 |
| 已折叠状态从 localStorage 读 | li 加 `data-crm-month-hidden` |
| 点击 header → 翻转折叠 | localStorage 写入；li 的 `data-crm-month-hidden` 切换 |
| cat 接口减少到 4（< 5） | 已注入的 header 被清理；data-crm-month 移除 |
| 默认最新月展开、其它折叠 | 没 localStorage 记录时，最新月 header `data-crm-collapsed=false`，其它 `true` |

### 手动浏览器验证

1. 打开任意 YApi 项目，进 "文档" 等 ≥ 5 接口的 cat
2. 应看到月份 header（如 "2026-05 (2)" / "2026-04 (3)"），最新月展开、其它折叠
3. 点 header → 折叠切换；刷新页面 → 状态保留
4. 切到接口数 < 5 的 cat → 无 header
5. 用 YApi 搜索框过滤 → 不破坏（observer 重新处理）

### 不测的事

- YApi 内部 React state 行为
- 复杂 cat 树嵌套（YApi 自己只有两层）

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| MutationObserver 触发抖动 | 150ms debounce |
| React 重建 header 频繁 | 观察实测；如果抖动明显，加 RAF + 渲染前快照对比 |
| `CSS.escape(headerId)` 在老浏览器不可用 | manifest v3 只支持 Chromium 88+，`CSS.escape` 自 Chrome 64 起原生支持 |
| 月份 regex 误伤标题里的偶发年-月字符串 | 限制第一个匹配 + 范围校验；本期接受少量误伤 |
| 用户的非 docs-sync 接口（如真 API）标题不含日期 | 落入"无日期"组 = 不变；无副作用 |
| YApi 切换 ant-tree class 命名 | 静默退化；不破坏 YApi 原生行为 |

## 10. 不在本期范围内

- 主题前缀分组（"AI Girls" / "AI 女友" 等）
- 用户自定义正则配置 popup
- 二级嵌套（主题 + 月份）
- 启用开关（popup 里"启用/禁用 分组"按钮）
- chrome.storage 跨设备同步
- "全部接口" 视图下的分组
- 拖拽重排顺序

## 11. 发布计划

- manifest.json: `4.5.21` → `4.6.0`（minor，新功能）
- CHANGELOG 加 4.6.0 段
- git push 到 main
- Chrome Web Store 上架走现有 `build-extension.sh` 流程（不在本 spec 范围）
