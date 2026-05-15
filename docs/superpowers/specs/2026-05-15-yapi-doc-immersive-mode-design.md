# YApi 文档型接口沉浸式查看模式 — 设计文档

**日期**：2026-05-15
**目标包**：浏览器扩展 `cross-request-master`（manifest 4.5.18 → 4.5.19）
**触发**：docs-sync 0.6.1 把 HTML 文档以 `<iframe srcdoc>` 形式写入 YApi 接口的 `desc` 字段后，"基本信息 / 请求参数 / 返回数据" 三个区块在文档型接口上完全是噪声，挤占阅读空间。需要扩展自动识别 docs-sync 文档并隐藏这三块，让 "备注"（实际文档内容）独占视野。

## 1. 背景与现状

`content-script.js`（单文件 ~1815 行）注入到所有 https 页面：
- `parseYapiInterfaceRoute()`：从 URL 提取 `{ projectId, apiId }`
- `fetchInterfaceDetail(origin, apiId)`：调 `/api/interface/get?id=...` 拉接口详情
- `mountButtons()`（line 1748）：在 `h2.interface-title`（"基本信息"）末尾挂 "YApi 工具" / "复制给 AI" 两个按钮
- `tick()` + `MutationObserver`（line 1798-1814）：800ms 间隔 + DOM 变更触发，处理 SPA 路由

YApi 接口详情页区块布局（自上而下）：
- `h2.interface-title` "基本信息"（CRM 按钮目前挂在这里）
- 基本信息字段（接口名称 / 状态 / 接口路径 / Mock 地址 / 创建人 / 更新时间）
- `h2.interface-title` "请求参数"
- Headers / Query / Body 表格
- `h2.interface-title` "返回数据"
- 响应数据 schema 表格
- `h2.interface-title` "备注"
- 用户写的备注内容（docs-sync 推上来的 iframe 文档就渲染在这里）

## 2. 目标与非目标

**目标**：

- 检测到 docs-sync HTML 文档 → 自动进入沉浸式：隐藏 "基本信息 / 请求参数 / 返回数据" 三块，让 "备注" 独占视野。
- 提供一个右上角浮动 "退出沉浸式" 按钮，本会话内不再自动重入。
- 对非文档型接口零行为变化。
- 检测成本极低：每个 `apiId` 只请求一次 `/api/interface/get` 接口详情，结果内存缓存。

**非目标**：

- 不持久化用户的"退出"偏好（刷新页面后允许重新自动进入；想永久关，未来再加 chrome.storage）。
- 不识别非 docs-sync 文档（如手写在备注里的 markdown），后续按需扩展启发式。
- 不挪 "YApi 工具" / "复制给 AI" 按钮 — 沉浸态下随基本信息一起隐藏，需要时点退出。
- 不改 YApi 原生 DOM 结构（只读取 / 加 data-attribute，不增删节点）。

## 3. 关键设计决策（来自 brainstorming）

| 决策点 | 选项 | 理由 |
|--------|------|------|
| 触发方式 | **自动检测 + 浮动退出按钮** | docs-sync 文档信号 100% 可靠（iframe srcdoc），自动进入对工作流最无感；偶尔需要看 path/Mock 时点退出 |
| 检测信号 | **仅 docs-sync**：`desc` 以 `<iframe srcdoc=` 开头 **或** `markdown` 以 `> ⚠️ 此文档由 HTML 源生成` 开头 | 零误判；手写文档不在本期范围 |
| 隐藏范围 | **三块全隐**：基本信息 / 请求参数 / 返回数据；保留：备注 | 文档型接口下三块都是噪声 |
| 隐藏机制 | **JS 打 data-attribute + CSS 选择器** | 不动 YApi 原生 DOM；CSS 切换性能最优；抗 React 重渲染 |
| 退出语义 | **本会话内不再自动重入；刷新页面重判** | 退出意图通常是临时（看一下 path）；不需要持久化 |
| 状态作用域 | **每 `apiId` 独立** | 在文档 A 退出，不影响文档 B 自动进入 |

## 4. 数据模型 / 状态

```ts
// content-script.js 模块作用域内的内存 Map
const immersiveCache = new Map<string /* apiId */, 'yes' | 'no' | 'exitedByUser'>();
const immersiveInflight = new Set<string /* apiId */>(); // 去重并发请求
```

**生命周期**：tab 关闭或刷新即清空。无持久化。

## 5. 模块边界

### 5.1 纯函数（可单测）

```js
// 输入 YApi 接口详情 data，输出是否文档型
// 容忍前后空白、空格变体；不需要 HTML decode（docs-sync 写入是 raw 字符串）
function isImmersiveDoc(data) {
  if (!data || typeof data !== 'object') return false;
  const desc = String(data.desc || '').trim();
  const markdown = String(data.markdown || '').trim();
  if (/^<iframe\s+srcdoc=/.test(desc)) return true;
  if (/^>\s*⚠️\s*此文档由\s*HTML\s*源生成/.test(markdown)) return true;
  return false;
}
```

### 5.2 DOM 打标（每次 tick 调用，幂等）

```js
const SECTION_LABELS = [
  { text: '基本信息', kind: 'basic' },
  { text: '请求参数', kind: 'req' },
  { text: '返回数据', kind: 'res' },
  { text: '响应数据', kind: 'res' },  // 兜底
  { text: '备注', kind: 'notes' },
];

// YApi 实际 DOM 不一定保证 "h2 与内容同级兄弟"，可能把每块包成 section/div。
// 打标策略要同时覆盖两种结构，并保持幂等：
//
//   A. 平级兄弟：tag h2 + 所有后续 sibling 直到下一个 h2.interface-title
//   B. 嵌套包裹：tag h2 + 它所有"只含本 h2、不含其它 h2.interface-title"的祖先节点
//
// 两种 tag 都用同一个 data-crm-section 属性，CSS 一句话同时覆盖。
function tagSections() {
  const titles = Array.from(document.querySelectorAll('h2.interface-title'));
  titles.forEach((h2) => {
    const text = (h2.textContent || '').trim();
    const match = SECTION_LABELS.find((s) => text.includes(s.text));
    if (!match) {
      // 若之前标过、现在文本被改了，清掉旧标记避免误隐
      if (h2.dataset.crmSection) delete h2.dataset.crmSection;
      return;
    }
    const kind = match.kind;
    if (h2.dataset.crmSection !== kind) h2.dataset.crmSection = kind;

    // A. 平级兄弟链
    let sib = h2.nextElementSibling;
    while (sib && !(sib.tagName === 'H2' && sib.classList.contains('interface-title'))) {
      if (sib.dataset.crmSection !== kind) sib.dataset.crmSection = kind;
      sib = sib.nextElementSibling;
    }

    // B. 向上找"只含本 h2"的祖先（处理 YApi 把每块包成 div 的情况）
    let p = h2.parentElement;
    while (p && p !== document.body) {
      const innerTitles = p.querySelectorAll('h2.interface-title');
      if (innerTitles.length === 1 && innerTitles[0] === h2) {
        if (p.dataset.crmSection !== kind) p.dataset.crmSection = kind;
        p = p.parentElement;
      } else {
        break;  // 祖先包含其它 h2 → 不再向上，否则会误隐 "备注" 等
      }
    }
  });
}
```

**两种 DOM 结构都覆盖**：
- 平级兄弟（结构 A）→ 兄弟链获得 tag → CSS 直接隐
- 嵌套 div（结构 B）→ 祖先获得 tag → CSS 隐整个祖先（包括 h2 + 内容）
- 混合结构（h2 在 div 里，但 div 也含别的区块）→ 仅 h2 自己被标 → CSS 隐 h2 而不隐内容；属于已知不完美兜底，需 jsdom 测试覆盖确认实际 YApi DOM 不属于这种结构

### 5.3 CSS（注入到页面）

```css
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

### 5.4 进入 / 退出沉浸式

```js
function enterImmersive(apiId) {
  document.body.classList.add('crm-doc-immersive');
  ensureExitButton(apiId);
}

function exitImmersive(apiId) {
  document.body.classList.remove('crm-doc-immersive');
  removeExitButton();
  immersiveCache.set(apiId, 'exitedByUser');
}

function ensureExitButton(apiId) {
  if (document.getElementById('crm-exit-immersive')) return;
  const btn = document.createElement('button');
  btn.id = 'crm-exit-immersive';
  btn.type = 'button';
  btn.textContent = '↩ 退出沉浸式';
  btn.addEventListener('click', () => exitImmersive(apiId));
  document.body.appendChild(btn);
}

function removeExitButton() {
  const btn = document.getElementById('crm-exit-immersive');
  if (btn) btn.remove();
}
```

### 5.5 主检测循环

```js
async function checkImmersive() {
  const route = parseYapiInterfaceRoute();
  if (!route) {
    // 不在接口页 → 清理沉浸态
    if (document.body.classList.contains('crm-doc-immersive')) {
      document.body.classList.remove('crm-doc-immersive');
      removeExitButton();
    }
    return;
  }
  const apiId = route.apiId;
  const cached = immersiveCache.get(apiId);

  if (cached === 'exitedByUser') return;
  if (cached === 'yes') {
    tagSections();
    enterImmersive(apiId);
    return;
  }
  if (cached === 'no') return;
  if (immersiveInflight.has(apiId)) return;

  immersiveInflight.add(apiId);
  try {
    const data = await fetchInterfaceDetail(location.origin, apiId);
    // 竞态防护：await 期间 SPA 可能已切到别的 apiId；
    // 旧请求返回时如果 URL 已经变了，丢弃结果不写 cache、不进入沉浸态。
    const currentRoute = parseYapiInterfaceRoute();
    if (!currentRoute || currentRoute.apiId !== apiId) return;

    const isDoc = isImmersiveDoc(data);
    immersiveCache.set(apiId, isDoc ? 'yes' : 'no');
    if (isDoc) {
      tagSections();
      enterImmersive(apiId);
    }
  } catch {
    // 不写 'no' 避免一次网络抖动让本会话永远进不了沉浸态；
    // 下次 tick 会重新尝试（inflight 已在 finally 释放）。
  } finally {
    immersiveInflight.delete(apiId);
  }
}
```

**关键防护**：
- **await 后重新校验 apiId**：避免旧请求把沉浸态加到新页面、退出按钮绑错 id
- **catch 不写 cache='no'**：网络抖动不应导致本会话永远失能；下一次 tick 自然重试

### 5.6 集成到 tick

现有 `tick()`（line 1798-1808）末尾追加：

```js
const tick = () => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    const old = document.getElementById(BTN_GROUP_ID);
    if (old) old.remove();
    // URL 变化：清理上一文档的沉浸态（新文档可能是非文档型）
    document.body.classList.remove('crm-doc-immersive');
    removeExitButton();
  }
  mountButtons();
  mountPathParamButton();
  mountHeaderButton();
  ensureSendClickIntercept();
  tagSections();      // 每次 tick 都打标，幂等
  checkImmersive();   // 异步，无 await，不阻塞 tick
};
```

## 6. 文件级改造清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `content-script.js` | 加入 §5.1–5.6 所有函数，挂载到现有 tick |
| 2 | `content-script.js` | `ensureStyle()` 已有的 style 注入函数追加 §5.3 的 CSS |
| 3 | `manifest.json` | version `4.5.18` → `4.5.19` |
| 4 | `tests/yapi-doc-immersive.test.js`（新建） | `isImmersiveDoc` + `tagSections` 单测（jsdom）；约 15 个用例 |
| 5 | `CHANGELOG.md` 或 README 的版本记录段 | 加 4.5.19 changelog |

**diff 量估计**：~120 行净增。

## 7. 错误处理 / 边界

| 场景 | 行为 |
|------|------|
| `/api/interface/get` 网络失败 | cache="no"；用户看到完整 YApi 页面，无影响 |
| `data.desc` 不是字符串 | `String(data.desc \|\| '')` 兜底；`startsWith` 永远安全 |
| YApi 改了 DOM 结构 / 删除 `h2.interface-title` 类 | 找不到 h2 → 不打标 → CSS 选择器无匹配 → 退化为无操作（页面正常）|
| 用户在沉浸态下导航到非文档接口 | tick 检测 URL 变化 → 移除 body 类 + 浮层按钮 → 新接口走自己的判定 |
| 用户点退出后切到另一个文档接口 | 另一个 apiId 走自己的 cache 流程；自动进入 |
| `tagSections()` 重复 tick 调用 | 每次都重新扫，但 dataset 写入是幂等的（值相同时跳过） |
| `tick()` 调用 `checkImmersive()` 但前一次未完成 | `immersiveInflight` 去重 |
| 同一 tab 内打开多个接口页 | 每个 apiId 独立 cache key，互不影响 |
| 用户退出后切走再切回同一接口 | `cache='exitedByUser'` 仍在 → 不自动重入。**这是设计意图**：退出意图通常持续整次浏览。刷新页面才能重置（spec §3 "退出语义" 列了此 trade-off） |
| await fetchInterfaceDetail 期间 SPA 切到别的接口 | 旧请求返回时校验当前 URL，apiId 不匹配则丢弃结果（§5.5）|
| fetchInterfaceDetail 网络失败 | 不写 cache，下一次 tick 重试；避免一次抖动让本会话永久失能 |

## 8. 测试策略

### 单元测试 `tests/yapi-doc-immersive.test.js`（jsdom）

由于扩展运行在浏览器，单测覆盖两个纯函数：

**`isImmersiveDoc(data)`**：

| 用例 | 期望 |
|------|------|
| `desc` 以 `<iframe srcdoc=` 开头 | `true` |
| `desc` 前面带空白：`"   \n<iframe srcdoc=..."` | `true` |
| `desc` 以 `<iframe srcdoc =`（多空格变体）开头 | `true`（regex `\s+` 容忍） |
| `markdown` 以 `> ⚠️ 此文档由 HTML 源生成` 开头 | `true` |
| `markdown` 多空格变体：`">  ⚠️  此文档由  HTML  源生成"` | `true` |
| 两者都不匹配 | `false` |
| `data = null` | `false` |
| `data = {}` | `false` |
| `desc` 非字符串（`null` / `number`） | `false`（不抛错） |

**`tagSections(document)`**（用 jsdom 构造 DOM 测）：

| DOM 结构 | 期望 |
|---------|------|
| 平级兄弟：`<h2>基本信息</h2><div>fields</div><h2>请求参数</h2><div>req</div>...` | 所有 div 都被打 `data-crm-section` 对应值 |
| 嵌套包裹：`<section><h2>基本信息</h2><div>fields</div></section><section><h2>请求参数</h2>...</section>` | 每个 `<section>` 自身被打标，因为它"只含一个 h2" |
| 混合：`<section><h2>基本信息</h2></section><div>fields</div>` | h2 + section 被打标；外层 div 不被打（因兄弟链止于 section？此结构罕见，记录为已知不完美） |
| 标题文本被改成不在 SECTION_LABELS 列表（如 "示例代码"） | h2 不被打标 |
| 同一 DOM 反复跑 tagSections（幂等） | 第二次跑没有 dataset 写入抖动 |
| 之前打过标的 h2 文本现在不匹配了 | 老 dataset 被清理 |
| "备注" 标题及其后内容 | 打 `data-crm-section="notes"`，但 CSS 选择器不隐藏 notes |

### 手动浏览器验证

1. 打开 docs-sync 推过的 HTML 文档接口 → 应自动隐三块，浮层"退出沉浸式"出现
2. 点退出 → 三块出现，浮层消失
3. 切到普通接口 → 行为不变
4. 刷新文档页 → 自动重入沉浸式
5. 在文档页和普通接口间来回切 → 状态正确

### 不测的事

- React 重渲染 / MutationObserver 触发 — 由现有 tick 兜底
- YApi 后端 API 响应格式 — 假定稳定

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| YApi 改 `h2.interface-title` class 名 | 退化为无操作（CSS 找不到匹配 → 不隐藏）；不会破坏页面 |
| 检测请求被 YApi 拦截 / 鉴权失败 | cache="no" 兜底，沉默 |
| docs-sync 0.5.x 老文档（无 iframe）误判为非文档 | 不自动进入；用户用 0.6.1 + `--force` 升级后会重新走 iframe，恢复自动 |
| 浮层 z-index 跟 YApi 自家 modal 撞 | `z-index: 2147483647`（CSS 最大值），保证浮在最上 |
| 用户切窗口后回来浮层位置错 | `position: fixed` 不受滚动影响；OK |
| 兄弟链打标走过头（一直打到 footer） | h2.interface-title 之间没有其他 h2，循环条件正确就行；新增的"备注"也是 h2.interface-title，自然终止 |
| YApi DOM 是嵌套结构而非平级 | §5.2 双策略（兄弟链 + 祖先链）兜底 |
| 浮层 `top:16px / right:16px` 跟 YApi 自家 toast / 通知重叠 | 已知小风险；本期接受，未来可改为底部或可拖动；YAPI 在 modal/toast 区另有 z-index 体系，但即便重叠也不影响功能（点退出按钮仍可用） |
| 用户切走再回到同一文档想再看（已退出过） | 设计意图：保持退出态。刷新页面重置。文档里 §3 / §7 都明确 |

## 10. 不在本期范围内

- 持久化退出偏好（chrome.storage）
- 识别非 docs-sync 文档（手写 markdown / category 关键字）
- 把 "YApi 工具" / "复制给 AI" 在沉浸态搬到浮层
- 隐藏 YApi 顶部导航 / 左侧接口树（"真全屏"）
- 沉浸态可配置（隐哪几块由用户选）

## 11. 发布计划

- manifest.json: `4.5.18` → `4.5.19`
- CHANGELOG 加 4.5.19：docs-sync 文档自动沉浸式查看
- Git push 到 main；Chrome Web Store 上架走现有 `build-extension.sh` 流程（不在本 spec 范围）
