# yapi-mcp docs-sync 支持 HTML 源文件 — 设计文档

**日期**：2026-05-14
**目标包**：`packages/yapi-mcp`
**触发**：CLAUDE.md 全局规则确立"HTML 取代 markdown 作为对外文档标准"后，docs-sync 仍只接受 `.md`，导致团队产出的 HTML 文档必须先反向转 markdown 或绕过 CLI 直接调 `/api/interface/up` 才能上传 YApi。

## 1. 背景与现状

`packages/yapi-mcp/src/cli/commands/docs-sync.ts`（1679 行）实现的同步流程：

1. 扫描目录里 `.endsWith(".md")` 且 `name !== "README.md"` 的文件。
2. 对每个 markdown 文件：
   - 用 `extractFirstMarkdownH1Title` 抽取标题。
   - 用 `renderMarkdownToHtml`（pandoc 优先，markdown-it fallback）渲染 HTML，处理 mermaid / diagram 代码块。
   - 用 `buildDocsSyncHash(markdown, options)` 计算内容 hash，与 `.yapi/docs-sync.json` 里的 `file_hashes[relName]` 比较，未变则跳过。
3. POST `/api/interface/up`，payload 形如 `{ id: docId, markdown, desc: html }`。
4. 成功后写回新 hash。

YApi 后端的接口文档表本身就是「markdown 源 + 渲染后 HTML 描述」并存的结构，`desc` 字段就是 HTML。瓶颈完全在 CLI 一侧。

## 2. 目标与非目标

**目标**：

- docs-sync 自动识别目录中的 `.html` 文件并上传到 YApi。
- HTML 文件**跳过渲染管线**（mermaid / diagram / pandoc 全不走），原样作为 `desc` 上传。
- 对现有 `.md` 流程**零行为变化**：相同 markdown 文件第一次跑升级版 CLI 不应触发不必要的重 push。
- 团队成员在 YApi 网页 UI 打开 HTML 源文档时能立即看出"这是 HTML 源生成的，别在网页编辑"。

**非目标**：

- 不做 HTML → markdown 反向转换。
- 不做 HTML 内容净化（XSS 过滤）；信任源（团队内部产出）。
- 不做 HTML 里相对路径资源（图片 / 字体）的内联或重写；CLAUDE.md 全局规则已要求 HTML 必须 self-contained。
- 不引入新的扩展名（`.htm` / `.markdown` 不收）。
- 不做 mapping 文件里"孤立 hash 条目"的主动清理（用户可能临时切回 .md）。

## 3. 关键设计决策（来自 brainstorming）

| 决策点 | 选项 | 理由 |
|--------|------|------|
| HTML 文件上传时 `payload.markdown` 字段填什么 | **警告横幅 + HTML 源码块** | YApi 网页 UI 编辑视图展示的是 markdown 字段，纯空字符串会让团队成员误以为文档为空、保存后覆盖 desc。横幅明确告警 + 源码块让"想看源"的人能直接复制走，也提供了 markdown ↔ html 切换的最小可恢复语义。 |
| HTML 文件发现机制 | **默认自动按扩展名收（.md + .html）** | 符合"HTML 取代 markdown"的方向；零配置；如有误推（截图说明、fixture）可通过 .yapiignore 或文件名前缀排除。 |
| `.md` / `.html` 同 stem 冲突 | **HTML 优先 + warn，不报错** | 软迁移友好；团队加 .html 当天就生效，不强制先删 .md；同一 docId 不会被双源 push（必须二选一）。 |
| Hash 输入是否兼容旧 markdown 哈希 | **是 — markdown kind 走旧路径，html kind 加 `html:` 前缀** | 避免 CLI 升级后所有团队第一次跑触发全量重 push 的 surprise。 |
| 扩展架构 | **方案 A：引入 `SourceDoc` 抽象** | 当前 1679 行单文件已经偏臃肿；HTML 不是临时分支而是新一等公民；纯函数边界让测试粒度变细。 |

## 4. 数据模型

```ts
// 新文件：src/docs/source-doc.ts

export type SourceDocKind = "markdown" | "html";

export interface SourceDoc {
  kind: SourceDocKind;
  /** 源文件相对路径，如 "round-option-percentage.html" */
  relPath: string;
  /** 原始内容（未渲染） */
  raw: string;
  /** 从源文件抽取的标题 */
  title: string;
}
```

**`mapping.file_hashes` schema 不变**：key 是文件名含扩展名（`foo.md` / `foo.html`），切换扩展名时旧 key 沦为孤立条目，无害。

## 5. 模块边界

新模块 `src/docs/source-doc.ts` 导出 4 个纯函数：

```ts
/** 按扩展名加载并解析源文档 */
export function loadSourceDoc(absPath: string, relPath: string): SourceDoc;

/** 渲染为 YApi 接收的 HTML（markdown 走现有渲染管线；html 原样） */
export function renderSourceDocToHtml(
  doc: SourceDoc,
  options: DocsSyncOptions,
  logPrefix: string,
): {
  html: string;
  mermaidFailed: boolean;
  diagramFailed: boolean;
  diagramMetrics: DiagramRenderMetric[];
};

/** 构造 YApi payload 的 markdown 字段（md 原文 / html 警告横幅+源码块） */
export function buildPayloadMarkdownField(doc: SourceDoc): string;

/** 列目录里所有源文档候选 + 冲突解决 */
export function listSourceDocFiles(
  dir: string,
): { file: string; kind: SourceDocKind }[];

export function resolveConflicts(
  entries: { file: string; kind: SourceDocKind }[],
): {
  kept: { file: string; kind: SourceDocKind }[];
  dropped: string[]; // 被冲突剔除的 .md 文件名（用于 warn 输出）
};
```

### 5.1 `buildPayloadMarkdownField` 输出格式（html 分支）

```
> ⚠️ 此文档由 HTML 源生成，请勿在 YApi 网页编辑（会覆盖 desc）。
> 源文件：<relPath>

\`\`\`html
<raw HTML 原文>
\`\`\`
```

### 5.2 `extractDocTitle`（loadSourceDoc 内部）

- markdown：复用现有 `extractFirstMarkdownH1Title`。
- html：优先级 `<title>` 标签 → 第一个 `<h1>` → 空串。
- 上层调用方负责 `title || stem` 兜底（保持与现状一致）。
- 实现：正则即可，不引入 cheerio。

### 5.3 `buildDocsSyncHash` 兼容形态

```ts
// src/cli/utils.ts
export function buildDocsSyncHash(doc: SourceDoc, options: DocsSyncOptions): string {
  const input = doc.kind === "markdown" ? doc.raw : `html:${doc.raw}`;
  // 其余拼接 options 序列化部分保持不变
}
```

## 6. 文件级改造清单

| # | 位置 | 现状 | 改动 |
|---|------|------|------|
| 1 | `docs-sync.ts:22-48` import 块 | 从 `../../docs/markdown` 引入 markdown helpers | 新增从 `../../docs/source-doc` 引入 4 个新函数；保留 `renderMarkdownToHtml` 等被新模块内部转调的导入 |
| 2 | `docs-sync.ts:376` 主扫描 | `.filter(name => name.endsWith(".md") && name !== "README.md")` | 替换为 `listSourceDocFiles(dir)` + `resolveConflicts(...)`；对 dropped 数组逐项 `console.warn` |
| 3 | `docs-sync.ts:1297` watch 模式文件过滤器 | `if (!name.endsWith(".md")) return;` | 改为 `if (!name.endsWith(".md") && !name.endsWith(".html")) return;` |
| 4 | `docs-sync.ts:484` `buildUpdatePayload` | 形参 `markdown: string` | 改名 `markdownField: string`，行为不变 |
| 5 | `docs-sync.ts:614` `renderDocsSyncHtml` | 吃 markdown 字符串 | 重命名为 `renderSourceDocToHtml(doc, options, prefix)`，迁出到 `source-doc.ts`；html 分支返回 `{ html: doc.raw, mermaidFailed: false, diagramFailed: false, diagramMetrics: [] }` |
| 6 | `docs-sync.ts:680-740` `updateInterface` + 4 处调用点 | `markdown: string` 参数 | 改成 `markdownField: string`，调用点同步 |
| 7 | `docs-sync.ts:741-743` 主循环文件读取 + title 抽取 | `fs.readFileSync` + `extractFirstMarkdownH1Title` | 改为 `const doc = loadSourceDoc(absPath, relName); const desiredTitle = doc.title \|\| stem;` |
| 8 | `docs-sync.ts:769` mermaid 检测 | `/```mermaid/.test(markdown)` | 加 `doc.kind === "markdown" &&` 守卫 |
| 9 | `docs-sync.ts:780,859` `buildDocsSyncHash(markdown, options)` | 吃字符串 | 改吃 `SourceDoc` |
| 10 | `docs-sync.ts:801-852` mermaid/diagram fallback 重试 | 重试调 renderDocsSyncHtml | 仅变量名 `markdown` → `doc`；html 分支因守卫永远走不到，无逻辑变化 |
| 11 | `cli/utils.ts:477` `buildDocsSyncHash` 定义 | 吃 markdown 字符串 | 改吃 `SourceDoc`，按 5.3 兼容形态 |
| 12 | 新文件 `src/docs/source-doc.ts` | — | 实现 §5 列出的 5 个导出 |
| 13 | 新文件 `tests/docs/source-doc.test.ts` | — | 单测见 §8 |
| 14 | 新文件或扩展 `tests/cli/docs-sync.integration.test.ts` | — | 集成测试见 §8 |
| 15 | `packages/yapi-mcp/README.md` | docs-sync 章节只提 markdown | 加 HTML 支持说明 + 同名冲突说明 + 警告横幅示例 |
| 16 | `packages/yapi-mcp/CHANGELOG.md` | — | 加一条 minor 版本 changelog（建议 0.6.0：新功能） |

**diff 量估计**：净增 ~250 行（含测试）。其中纯重命名 ~120 行 / 新模块 ~80 行 / 测试 ~80 行 / watch filter ~5 行 / CHANGELOG+README ~10 行。

## 7. 错误处理 / 边界场景

| 场景 | 行为 |
|------|------|
| HTML 文件无 `<title>` 且无 `<h1>` | title 取空串，上层 fallback 用 stem |
| HTML 文件 BOM | `fs.readFileSync(..., "utf8")` 已正确处理 |
| HTML 体积偏大 | summary 里同步打印 HTML 源字节数；不设上限，由 YApi 后端抛错暴露 |
| HTML 含 `<script>` / 外链 | 不净化、原样上传；README 提示"上传前自行审查" |
| HTML 含相对路径资源 | 不处理；README 明示"HTML 必须 self-contained，遵循 CLAUDE.md 全局规则" |
| `foo.md` + `foo.html` 同 stem | `resolveConflicts` 保留 html、记 dropped；主流程对 dropped 逐项 warn |
| 用户把 `foo.md` 改名为 `foo.html` | mapping 里 `foo.md` 沦为孤立 hash 条目；YApi 上原文档保留（无 prune 删除逻辑）；下次同步 `foo.html` 当新文件处理（hash 不匹配 → push） |
| 同名 stem 但 mapping 里两边都有 binding | 当前 schema 是 `file_hashes` 单 map，不存在两个 binding；冲突解决只在文件系统层面发生 |
| HTML 解析失败（不可能，因为不解析） | N/A |

## 8. 测试策略

### 单元测试 `tests/docs/source-doc.test.ts`

| 用例 | 期望 |
|------|------|
| `extractDocTitle` — md `# Title` | 返回 "Title" |
| `extractDocTitle` — html `<title>X</title>` | 返回 "X" |
| `extractDocTitle` — html 无 `<title>` 但有 `<h1>Y</h1>` | 返回 "Y" |
| `extractDocTitle` — 都没有 | 返回空串 |
| `loadSourceDoc` — `.md` 文件 | `kind === "markdown"` |
| `loadSourceDoc` — `.html` 文件 | `kind === "html"` |
| `buildPayloadMarkdownField` — markdown doc | 返回 `doc.raw` |
| `buildPayloadMarkdownField` — html doc | snapshot：包含 `⚠️`、`源文件：<relPath>`、` ```html ` 围栏与 raw 内容 |
| `resolveConflicts` — 纯 md / 纯 html | 全部 kept，dropped 空 |
| `resolveConflicts` — `foo.md` + `foo.html` | kept 含 `foo.html`，dropped 含 `foo.md` |
| `resolveConflicts` — 多个冲突 | 每个冲突 stem 都正确处理 |

### 单元测试 `tests/cli/utils.test.ts`（或文件已存在则扩展）

| 用例 | 期望 |
|------|------|
| `buildDocsSyncHash` — markdown kind | hash === 旧版直接对 markdown 字符串算出的 hash（回归保证升级零重 push） |
| `buildDocsSyncHash` — html kind | hash !== 同 raw 但 kind=markdown 的 hash |

### 集成测试 `tests/cli/docs-sync.integration.test.ts`

fixture 目录：1 个 `.md` + 1 个 `.html`，mock `request`。

- HTML 那次 `interface/up` payload 的 `markdown` 包含 `"⚠️"` 字符串与 ```` ```html ```` 围栏开头
- HTML 那次 payload 的 `desc` 一字节不差等于 HTML 文件原始内容
- markdown 那次 payload 的 `markdown` 等于源 md 文件原文（兼容回归）
- 同 stem 冲突 fixture：检测到 warn 输出 + 只有 html 被 push

### 手动冒烟（不写自动化）

拿一份现成 HTML 文档配真 YApi docId 跑 `yapi docs-sync` → YApi 网页确认 desc 渲染正常 + 编辑视图能看到警告横幅。

### 不测的事

- YApi 网页 UI 渲染效果
- HTML 解析鲁棒性
- 端到端真实 YApi 实例 push

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 升级后所有团队第一次 sync 触发全量重 push | hash 兼容路径（5.3）保证 markdown kind 哈希值与旧版完全一致 |
| `markdown` 形参重命名导致 PR diff 噪音大 | PR 描述标注 "rename only, no behavior change"；评审时聚焦新模块 |
| docs/ 里非文档 HTML（截图说明）被误推 | 文档里提示用 `_draft.html` 前缀或 `.yapiignore` 排除 |
| 团队成员在 YApi 网页里误编辑警告横幅 markdown 字段 | 横幅文案明确写"不要在网页编辑"；后续可考虑 desc 顶部加可见警告条（本期不做） |

## 10. 不在本期范围内

- `--prune-orphan-hashes` flag 主动清理孤立 mapping 条目
- HTML 内容净化 / XSS 校验
- 相对路径资源 inline 化（base64 嵌入图片）
- `.htm` / `.markdown` 扩展名扩展
- desc 上传前的 HTML 体积上限校验
- HTML 转 markdown 反向转换

## 11. 发布计划

- 版本号：建议 `0.6.0`（新功能，semver minor）
- CHANGELOG 加一条："docs-sync 支持 .html 源文件；同 stem 冲突时 HTML 优先；现有 .md 流程零行为变化"
- README docs-sync 章节加 HTML 用法示例
