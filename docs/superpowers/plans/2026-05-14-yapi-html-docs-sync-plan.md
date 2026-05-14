# yapi-mcp docs-sync HTML 支持 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `@leeguoo/yapi-mcp` 的 `docs-sync` 命令把目录里的 `.html` 文件也当作一等公民同步到 YApi，HTML 跳过渲染管线原样上传，并对现有 `.md` 行为零变化。

**Architecture:** 引入 `SourceDoc` 抽象（新模块 `src/docs/source-doc.ts`），把"加载文件 / 抽取标题 / 决定 payload markdown 字段 / 渲染 HTML"四件事按 `kind: "markdown" | "html"` 分派。`docs-sync.ts` 主循环改成消费 `SourceDoc` 而非 markdown 字符串。`buildDocsSyncHash` 改吃 `SourceDoc`，对 markdown kind 走兼容路径（hash 值与旧版完全一致），对 html kind 加 `html:` 前缀。

**Tech Stack:** TypeScript / pnpm / node 内置 test runner (`node --test --import tsx tests/*.test.ts`) / `node:assert/strict`。包根 `packages/yapi-mcp/`，所有命令在该目录下执行。

**Spec:** `docs/superpowers/specs/2026-05-14-yapi-html-docs-sync-design.md`

---

## 关键工作目录约定

所有 `pnpm` 命令都在 `packages/yapi-mcp/` 下跑：

```bash
cd packages/yapi-mcp
```

测试运行器 glob 是 `tests/*.test.ts`（**不递归子目录**），所以新测试文件必须直接放在 `packages/yapi-mcp/tests/` 下，不能放 `tests/docs/`（spec §8 写的路径需要按此调整）。

## File Structure

**新增**：
- `packages/yapi-mcp/src/docs/source-doc.ts` — `SourceDoc` 类型、`loadSourceDoc`、`renderSourceDocToHtml`、`buildPayloadMarkdownField`、`listSourceDocFiles`、`resolveConflicts`、`extractDocTitle`
- `packages/yapi-mcp/tests/source-doc.test.ts` — 上述纯函数的单测
- `packages/yapi-mcp/tests/docs-sync-html.test.ts` — 主循环 + payload 字段集成测试（mock `YapiRequest`）

**修改**：
- `packages/yapi-mcp/src/cli/utils.ts` — `buildDocsSyncHash` 签名改吃 `SourceDoc`，兼容路径
- `packages/yapi-mcp/src/cli/commands/docs-sync.ts` — import 块、扫描位、主循环、`renderDocsSyncHtml` 删除（迁出到 source-doc.ts）、`buildUpdatePayload` / `updateInterface` 形参重命名、watch filter
- `packages/yapi-mcp/README.md` — docs-sync 章节补 HTML 用法
- `packages/yapi-mcp/CHANGELOG.md` — 加 0.6.0 changelog
- `packages/yapi-mcp/package.json` — version bump 0.5.2 → 0.6.0

---

### Task 1: Bootstrap 新模块与测试占位

新建空的 `source-doc.ts` 与对应测试，先把测试跑通（占位 assert），确认测试基础设施 OK 再开始 TDD。

**Files:**
- Create: `packages/yapi-mcp/src/docs/source-doc.ts`
- Create: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 创建空模块**

`packages/yapi-mcp/src/docs/source-doc.ts`:

```ts
// 源文档（.md / .html）抽象：把扫描、加载、标题抽取、渲染、payload markdown 字段
// 这几件事按文件类型分派，让 docs-sync.ts 主循环不再硬编码 markdown。
export type SourceDocKind = "markdown" | "html";

export interface SourceDoc {
  kind: SourceDocKind;
  relPath: string;
  raw: string;
  title: string;
}
```

- [ ] **Step 2: 创建测试占位**

`packages/yapi-mcp/tests/source-doc.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SourceDoc } from "../src/docs/source-doc";

describe("source-doc module", () => {
  test("bootstrap: SourceDoc type is exported", () => {
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: "", title: "" };
    assert.equal(doc.kind, "markdown");
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
cd packages/yapi-mcp
node --test --import tsx tests/source-doc.test.ts
```

Expected: 1 passing.

- [ ] **Step 4: 跑类型检查**

```bash
pnpm run type-check
```

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "feat(yapi-mcp): 引入 SourceDoc 抽象骨架"
```

---

### Task 2: `extractDocTitle` — HTML 标题抽取

从 HTML 字符串里抽取 `<title>` 或第一个 `<h1>`，markdown 复用现有 `extractFirstMarkdownH1Title`。

**Files:**
- Modify: `packages/yapi-mcp/src/docs/source-doc.ts`
- Modify: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 写测试**

追加到 `tests/source-doc.test.ts`：

```ts
import { extractDocTitle } from "../src/docs/source-doc";

describe("extractDocTitle", () => {
  test("markdown: returns first H1", () => {
    assert.equal(extractDocTitle("markdown", "# Hello\n\nbody"), "Hello");
  });
  test("markdown: empty → empty string", () => {
    assert.equal(extractDocTitle("markdown", ""), "");
  });
  test("html: returns <title> when present", () => {
    const html = "<!doctype html><html><head><title>Doc Title</title></head><body><h1>Other</h1></body></html>";
    assert.equal(extractDocTitle("html", html), "Doc Title");
  });
  test("html: falls back to first <h1> when no <title>", () => {
    const html = "<body><h1>Heading</h1></body>";
    assert.equal(extractDocTitle("html", html), "Heading");
  });
  test("html: returns empty when no <title> and no <h1>", () => {
    assert.equal(extractDocTitle("html", "<body><p>no heading</p></body>"), "");
  });
  test("html: <h1> with nested tags is unwrapped", () => {
    assert.equal(extractDocTitle("html", "<h1><span>X</span> Y</h1>"), "X Y");
  });
  test("html: trims whitespace", () => {
    assert.equal(extractDocTitle("html", "<title>  Spaced  </title>"), "Spaced");
  });
});
```

- [ ] **Step 2: 跑测试确认全部失败**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 7 failing (`extractDocTitle is not a function`).

- [ ] **Step 3: 实现**

`packages/yapi-mcp/src/docs/source-doc.ts` 追加：

```ts
import { extractFirstMarkdownH1Title } from "./markdown";

const HTML_TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, "").trim();
}

export function extractDocTitle(kind: SourceDocKind, raw: string): string {
  if (kind === "markdown") {
    return extractFirstMarkdownH1Title(raw).trim();
  }
  const titleMatch = HTML_TITLE_RE.exec(raw);
  if (titleMatch) {
    const inner = stripTags(titleMatch[1] || "");
    if (inner) return inner;
  }
  const h1Match = HTML_H1_RE.exec(raw);
  if (h1Match) {
    return stripTags(h1Match[1] || "");
  }
  return "";
}
```

- [ ] **Step 4: 跑测试**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 8 passing (1 bootstrap + 7 extractDocTitle).

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "feat(yapi-mcp): SourceDoc 标题抽取（md/html）"
```

---

### Task 3: `loadSourceDoc` — 按扩展名加载

**Files:**
- Modify: `packages/yapi-mcp/src/docs/source-doc.ts`
- Modify: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSourceDoc } from "../src/docs/source-doc";

describe("loadSourceDoc", () => {
  test("markdown file → kind=markdown", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "foo.md");
    writeFileSync(abs, "# Title\nbody", "utf8");
    const doc = loadSourceDoc(abs, "foo.md");
    assert.equal(doc.kind, "markdown");
    assert.equal(doc.relPath, "foo.md");
    assert.equal(doc.raw, "# Title\nbody");
    assert.equal(doc.title, "Title");
  });
  test("html file → kind=html", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "bar.html");
    writeFileSync(abs, "<title>HX</title><body>x</body>", "utf8");
    const doc = loadSourceDoc(abs, "bar.html");
    assert.equal(doc.kind, "html");
    assert.equal(doc.title, "HX");
    assert.equal(doc.raw, "<title>HX</title><body>x</body>");
  });
  test("unknown extension throws", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "baz.txt");
    writeFileSync(abs, "x", "utf8");
    assert.throws(() => loadSourceDoc(abs, "baz.txt"));
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 3 new failing (`loadSourceDoc is not a function`).

- [ ] **Step 3: 实现**

`source-doc.ts` 追加：

```ts
import fs from "node:fs";

function detectKindByExt(relPath: string): SourceDocKind | null {
  if (relPath.endsWith(".md")) return "markdown";
  if (relPath.endsWith(".html")) return "html";
  return null;
}

export function loadSourceDoc(absPath: string, relPath: string): SourceDoc {
  const kind = detectKindByExt(relPath);
  if (!kind) {
    throw new Error(`unsupported doc extension: ${relPath}`);
  }
  const raw = fs.readFileSync(absPath, "utf8");
  const title = extractDocTitle(kind, raw);
  return { kind, relPath, raw, title };
}
```

- [ ] **Step 4: 跑测试**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 11 passing.

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "feat(yapi-mcp): loadSourceDoc 按扩展名加载源文档"
```

---

### Task 4: `buildPayloadMarkdownField` — 警告横幅 + HTML 源码块

**Files:**
- Modify: `packages/yapi-mcp/src/docs/source-doc.ts`
- Modify: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { buildPayloadMarkdownField } from "../src/docs/source-doc";

describe("buildPayloadMarkdownField", () => {
  test("markdown doc → returns raw verbatim", () => {
    const doc = { kind: "markdown" as const, relPath: "a.md", raw: "# Hi\nbody", title: "Hi" };
    assert.equal(buildPayloadMarkdownField(doc), "# Hi\nbody");
  });
  test("html doc → banner + fenced source block", () => {
    const doc = { kind: "html" as const, relPath: "a.html", raw: "<p>hi</p>", title: "" };
    const out = buildPayloadMarkdownField(doc);
    assert.ok(out.includes("⚠️"));
    assert.ok(out.includes("此文档由 HTML 源生成"));
    assert.ok(out.includes("源文件：a.html"));
    assert.ok(out.includes("```html"));
    assert.ok(out.includes("<p>hi</p>"));
    assert.ok(out.endsWith("```"));
  });
  test("html doc with backticks in source still produces parseable fence", () => {
    // 极少见但要保护：源 html 包含 ``` 不应让代码围栏提前结束。
    const doc = { kind: "html" as const, relPath: "b.html", raw: "<pre>```inside```</pre>", title: "" };
    const out = buildPayloadMarkdownField(doc);
    // 用 ~~~html 围栏避开 ``` 冲突
    assert.ok(out.includes("~~~html") || !out.includes("```inside```\n```\n"));
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 3 new failing.

- [ ] **Step 3: 实现**

`source-doc.ts` 追加（注意第三个测试要求处理源码内 ``` 的情况，用 `~~~` 围栏作为 fallback）：

```ts
export function buildPayloadMarkdownField(doc: SourceDoc): string {
  if (doc.kind === "markdown") return doc.raw;
  const fence = doc.raw.includes("```") ? "~~~" : "```";
  return [
    "> ⚠️ 此文档由 HTML 源生成，请勿在 YApi 网页编辑（会覆盖 desc）。",
    `> 源文件：${doc.relPath}`,
    "",
    `${fence}html`,
    doc.raw,
    fence,
  ].join("\n");
}
```

- [ ] **Step 4: 跑测试**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 14 passing.

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "feat(yapi-mcp): HTML payload.markdown 字段警告横幅 + 源码围栏"
```

---

### Task 5: `listSourceDocFiles` + `resolveConflicts`

**Files:**
- Modify: `packages/yapi-mcp/src/docs/source-doc.ts`
- Modify: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { listSourceDocFiles, resolveConflicts } from "../src/docs/source-doc";

describe("listSourceDocFiles", () => {
  test("collects .md and .html, excludes README.*", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-list-"));
    writeFileSync(path.join(dir, "a.md"), "");
    writeFileSync(path.join(dir, "b.html"), "");
    writeFileSync(path.join(dir, "README.md"), "");
    writeFileSync(path.join(dir, "README.html"), "");
    writeFileSync(path.join(dir, "ignore.txt"), "");
    writeFileSync(path.join(dir, "ignore.htm"), "");
    const entries = listSourceDocFiles(dir).sort((x, y) => x.file.localeCompare(y.file));
    assert.deepEqual(entries, [
      { file: "a.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
  });
});

describe("resolveConflicts", () => {
  test("no conflict: returns all kept", () => {
    const r = resolveConflicts([
      { file: "a.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.dropped, []);
  });
  test("same stem .md + .html → keep html, drop md", () => {
    const r = resolveConflicts([
      { file: "foo.md", kind: "markdown" },
      { file: "foo.html", kind: "html" },
      { file: "bar.md", kind: "markdown" },
    ]);
    assert.deepEqual(r.kept.map((x) => x.file).sort(), ["bar.md", "foo.html"]);
    assert.deepEqual(r.dropped, ["foo.md"]);
  });
  test("multiple conflicts independent", () => {
    const r = resolveConflicts([
      { file: "a.md", kind: "markdown" },
      { file: "a.html", kind: "html" },
      { file: "b.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.dropped.sort(), ["a.md", "b.md"]);
    assert.ok(r.kept.every((x) => x.kind === "html"));
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Expected: 4 failing.

- [ ] **Step 3: 实现**

`source-doc.ts` 追加：

```ts
export interface SourceDocEntry {
  file: string;
  kind: SourceDocKind;
}

export function listSourceDocFiles(dir: string): SourceDocEntry[] {
  const out: SourceDocEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === "README.md" || name === "README.html") continue;
    const kind = detectKindByExt(name);
    if (!kind) continue;
    out.push({ file: name, kind });
  }
  return out;
}

export function resolveConflicts(
  entries: SourceDocEntry[],
): { kept: SourceDocEntry[]; dropped: string[] } {
  const byStem = new Map<string, SourceDocEntry[]>();
  for (const entry of entries) {
    const stem = entry.file.replace(/\.(md|html)$/, "");
    const arr = byStem.get(stem) ?? [];
    arr.push(entry);
    byStem.set(stem, arr);
  }
  const kept: SourceDocEntry[] = [];
  const dropped: string[] = [];
  for (const [, group] of byStem) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const htmlOne = group.find((g) => g.kind === "html");
    const mdOnes = group.filter((g) => g.kind === "markdown");
    if (htmlOne) {
      kept.push(htmlOne);
      for (const m of mdOnes) dropped.push(m.file);
    } else {
      // 不会发生（同 stem 但都是同类型扩展名）
      kept.push(group[0]);
    }
  }
  return { kept, dropped };
}
```

- [ ] **Step 4: 跑测试**

Expected: 18 passing.

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "feat(yapi-mcp): listSourceDocFiles + resolveConflicts（HTML 优先）"
```

---

### Task 6: 把 `renderDocsSyncHtml` 迁出到 `source-doc.ts` 并支持 html kind

把 `docs-sync.ts:614` 的 `renderDocsSyncHtml` 函数搬到 `source-doc.ts`，改名 `renderSourceDocToHtml`，html 分支直接原样返回。

**Files:**
- Modify: `packages/yapi-mcp/src/docs/source-doc.ts`
- Modify: `packages/yapi-mcp/src/cli/commands/docs-sync.ts`
- Modify: `packages/yapi-mcp/tests/source-doc.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { renderSourceDocToHtml } from "../src/docs/source-doc";

describe("renderSourceDocToHtml", () => {
  test("html doc → returns raw verbatim, no diagnostics", () => {
    const doc = { kind: "html" as const, relPath: "x.html", raw: "<p>hi</p>", title: "" };
    const result = renderSourceDocToHtml(doc, {} as any, "[test]");
    assert.equal(result.html, "<p>hi</p>");
    assert.equal(result.mermaidFailed, false);
    assert.equal(result.diagramFailed, false);
    assert.deepEqual(result.diagramMetrics, []);
  });
  test("markdown doc → renders to HTML containing rendered content", () => {
    const doc = { kind: "markdown" as const, relPath: "x.md", raw: "# Hello", title: "Hello" };
    const result = renderSourceDocToHtml(doc, {} as any, "[test]");
    assert.ok(result.html.includes("Hello"));
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Expected: 2 new failing.

- [ ] **Step 3: 实现（迁入）**

`source-doc.ts` 顶部追加 import：

```ts
import type { DocsSyncOptions } from "../cli/types";
import { renderMarkdownToHtml, type DiagramRenderMetric } from "./markdown";
```

`source-doc.ts` 末尾追加：

```ts
export function renderSourceDocToHtml(
  doc: SourceDoc,
  options: DocsSyncOptions,
  logPrefix: string,
): {
  html: string;
  mermaidFailed: boolean;
  diagramFailed: boolean;
  diagramMetrics: DiagramRenderMetric[];
} {
  if (doc.kind === "html") {
    return { html: doc.raw, mermaidFailed: false, diagramFailed: false, diagramMetrics: [] };
  }
  let mermaidFailed = false;
  let diagramFailed = false;
  const diagramMetrics: DiagramRenderMetric[] = [];
  const html = renderMarkdownToHtml(doc.raw, {
    noMermaid: options.noMermaid,
    logMermaid: true,
    mermaidLook: options.mermaidLook,
    mermaidHandDrawnSeed: options.mermaidHandDrawnSeed,
    logger: (message) => console.log(`${logPrefix} ${message}`),
    onDiagramRendered: (metric) => {
      diagramMetrics.push(metric);
    },
    onMermaidError: () => {
      mermaidFailed = true;
    },
    onDiagramError: () => {
      diagramFailed = true;
    },
  });
  return { html, mermaidFailed, diagramFailed, diagramMetrics };
}
```

- [ ] **Step 4: 跑 source-doc 测试**

```bash
node --test --import tsx tests/source-doc.test.ts
```

Expected: 20 passing.

- [ ] **Step 5: 删除 `docs-sync.ts` 里的旧 `renderDocsSyncHtml`**

`docs-sync.ts` 改动：
1. 删除 `:614-644` 的 `renderDocsSyncHtml` 函数定义。
2. 在文件顶部 import 块（line 39-48 区域）末尾追加：
   ```ts
   import {
     loadSourceDoc,
     renderSourceDocToHtml,
     buildPayloadMarkdownField,
     listSourceDocFiles,
     resolveConflicts,
   } from "../../docs/source-doc";
   ```
3. 修改 `:801` 调用：`renderDocsSyncHtml(markdown, ...)` → `renderSourceDocToHtml(doc, ...)`（**注意：此时 `doc` 还没定义，主循环改造在 Task 9 完成；为不破坏中间状态，本步先临时保留 `renderDocsSyncHtml` 调用**——见下方"暂存策略"）。

**暂存策略**：本步只迁出函数定义并加 export，**保留** `docs-sync.ts` 里 `renderDocsSyncHtml` 作为薄包装：

```ts
// docs-sync.ts —— 替换原 renderDocsSyncHtml 定义为薄包装：
function renderDocsSyncHtml(
  markdown: string,
  options: DocsSyncOptions,
  logPrefix: string,
): {
  html: string;
  mermaidFailed: boolean;
  diagramFailed: boolean;
  diagramMetrics: DiagramRenderMetric[];
} {
  return renderSourceDocToHtml(
    { kind: "markdown", relPath: "", raw: markdown, title: "" },
    options,
    logPrefix,
  );
}
```

包装会在 Task 9 主循环改造时一并删除。

- [ ] **Step 6: 跑类型检查 + 全部测试**

```bash
pnpm run type-check
pnpm test
```

Expected: 全部通过；现有 `yapi-cli.test.ts` 行为不变。

- [ ] **Step 7: 提交**

```bash
git add packages/yapi-mcp/src/docs/source-doc.ts packages/yapi-mcp/src/cli/commands/docs-sync.ts packages/yapi-mcp/tests/source-doc.test.ts
git commit -m "refactor(yapi-mcp): renderSourceDocToHtml 迁入 source-doc 模块"
```

---

### Task 7: `buildDocsSyncHash` 改吃 `SourceDoc`，markdown kind 走兼容路径

**Files:**
- Modify: `packages/yapi-mcp/src/cli/utils.ts`
- Modify: `packages/yapi-mcp/src/cli/commands/docs-sync.ts`
- Create: `packages/yapi-mcp/tests/docs-sync-hash.test.ts`

- [ ] **Step 1: 写测试**

`packages/yapi-mcp/tests/docs-sync-hash.test.ts`:

```ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, test } from "node:test";
import { buildDocsSyncHash } from "../src/cli/utils";
import type { SourceDoc } from "../src/docs/source-doc";
import type { DocsSyncOptions } from "../src/cli/types";

// 旧版 hash 算法（升级前）：拷贝自原 buildDocsSyncHash 实现，作为兼容回归基准。
function legacyHash(markdown: string, options: DocsSyncOptions): string {
  const hash = crypto.createHash("sha1");
  hash.update(options.noMermaid ? "no-mermaid\n" : "mermaid\n");
  if (!options.noMermaid) {
    if (options.mermaidLook) hash.update(`mermaid-look:${options.mermaidLook}\n`);
    if (Number.isFinite(options.mermaidHandDrawnSeed ?? NaN)) {
      hash.update(`mermaid-seed:${options.mermaidHandDrawnSeed}\n`);
    }
  }
  hash.update(markdown);
  return hash.digest("hex");
}

const opts = {} as DocsSyncOptions;

describe("buildDocsSyncHash", () => {
  test("markdown kind: hash equals legacy hash byte-for-byte", () => {
    const md = "# Title\nbody";
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: md, title: "Title" };
    assert.equal(buildDocsSyncHash(doc, opts), legacyHash(md, opts));
  });
  test("html kind: hash differs from same-raw markdown kind", () => {
    const raw = "<p>hi</p>";
    const mdDoc: SourceDoc = { kind: "markdown", relPath: "x.md", raw, title: "" };
    const htmlDoc: SourceDoc = { kind: "html", relPath: "x.html", raw, title: "" };
    assert.notEqual(buildDocsSyncHash(mdDoc, opts), buildDocsSyncHash(htmlDoc, opts));
  });
  test("html kind: hash deterministic", () => {
    const doc: SourceDoc = { kind: "html", relPath: "x.html", raw: "<p>hi</p>", title: "" };
    assert.equal(buildDocsSyncHash(doc, opts), buildDocsSyncHash(doc, opts));
  });
});
```

- [ ] **Step 2: 跑测试，确认全部失败（签名不匹配）**

```bash
node --test --import tsx tests/docs-sync-hash.test.ts
```

Expected: 3 failing（typescript 类型错误或 runtime 报错）。

- [ ] **Step 3: 改 `buildDocsSyncHash` 签名**

`packages/yapi-mcp/src/cli/utils.ts:477-490` 替换为：

```ts
export function buildDocsSyncHash(doc: SourceDoc, options: DocsSyncOptions): string {
  const hash = crypto.createHash("sha1");
  hash.update(options.noMermaid ? "no-mermaid\n" : "mermaid\n");
  if (!options.noMermaid) {
    if (options.mermaidLook) {
      hash.update(`mermaid-look:${options.mermaidLook}\n`);
    }
    if (Number.isFinite(options.mermaidHandDrawnSeed ?? NaN)) {
      hash.update(`mermaid-seed:${options.mermaidHandDrawnSeed}\n`);
    }
  }
  // 兼容路径：markdown kind 直接 hash raw（与旧版一字节不差）；html kind 加 "html:" 前缀避免撞车。
  hash.update(doc.kind === "markdown" ? doc.raw : `html:${doc.raw}`);
  return hash.digest("hex");
}
```

并在 `utils.ts` 顶部 import 添加：

```ts
import type { SourceDoc } from "../docs/source-doc";
```

- [ ] **Step 4: 临时修复 `docs-sync.ts` 两处旧调用**

`docs-sync.ts:780` 和 `:859` 当前是 `buildDocsSyncHash(markdown, effectiveOptions)`，临时改为：

```ts
buildDocsSyncHash({ kind: "markdown", relPath: relName, raw: markdown, title: "" }, effectiveOptions)
```

（主循环改造在 Task 8 完成，这里只是过渡。）

- [ ] **Step 5: 跑 hash 测试 + 类型检查 + 全部测试**

```bash
node --test --import tsx tests/docs-sync-hash.test.ts
pnpm run type-check
pnpm test
```

Expected: 3 新通过；其它现有测试不受影响。

- [ ] **Step 6: 提交**

```bash
git add packages/yapi-mcp/src/cli/utils.ts packages/yapi-mcp/src/cli/commands/docs-sync.ts packages/yapi-mcp/tests/docs-sync-hash.test.ts
git commit -m "refactor(yapi-mcp): buildDocsSyncHash 吃 SourceDoc，markdown 走兼容路径"
```

---

### Task 8: 改造主循环 — 消费 `SourceDoc`

把 `docs-sync.ts` 主循环（`:736-891` 区域）的所有 markdown 字符串变量统一替换为 `SourceDoc`，删除 Task 6 的临时薄包装。

**Files:**
- Modify: `packages/yapi-mcp/src/cli/commands/docs-sync.ts`

- [ ] **Step 1: 改 `resolveSourceFiles`（`:371-387`）**

把硬编码的 `.endsWith(".md")` 扫描替换为新模块调用。完整替换 `resolveSourceFiles` 函数：

```ts
function resolveSourceFiles(dirPath: string, mapping: DocsSyncMapping): string[] {
  const sources = Array.isArray(mapping.source_files) ? mapping.source_files : [];
  if (!sources.length) {
    const entries = listSourceDocFiles(dirPath);
    const { kept, dropped } = resolveConflicts(entries);
    for (const droppedFile of dropped) {
      console.warn(
        `⚠️ 检测到 ${droppedFile} 与同名 .html 共存，将上传 .html 版本；建议删除 ${droppedFile}。`,
      );
    }
    return kept
      .map((entry) => path.join(dirPath, entry.file))
      .sort((a, b) => a.localeCompare(b));
  }
  return sources.map((source) => {
    const resolved = path.isAbsolute(source) ? source : path.resolve(dirPath, source);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`source file not found: ${resolved}`);
    }
    return resolved;
  });
}
```

- [ ] **Step 2: 改主循环（`:736-891`）**

把 `for (const mdPath of files)` 循环里所有 markdown 字符串引用改成 `SourceDoc`。关键替换：

- `:741`：`const markdown = fs.readFileSync(mdPath, "utf8");` → `const doc = loadSourceDoc(mdPath, relName);`
- `:742`：`const desiredTitle = extractFirstMarkdownH1Title(markdown).trim() || stem;` → `const desiredTitle = doc.title || stem;`
- `:769`：`const hasMermaidBlocks = /\`\`\`mermaid\s*\r?\n/i.test(markdown);` → `const hasMermaidBlocks = doc.kind === "markdown" && /\`\`\`mermaid\s*\r?\n/i.test(doc.raw);`
- `:780`：`buildDocsSyncHash(markdown, effectiveOptions)` → `buildDocsSyncHash(doc, effectiveOptions)`
- `:801`：`renderDocsSyncHtml(markdown, ...)` → `renderSourceDocToHtml(doc, ...)`
- `:814`：`buildUpdatePayload(docId, titleToUpdate, markdown, html)` → `buildUpdatePayload(docId, titleToUpdate, buildPayloadMarkdownField(doc), html)`
- `:819`：`markdownBytes: Buffer.byteLength(markdown, "utf8")` → `markdownBytes: Buffer.byteLength(doc.raw, "utf8")`（注意：preview 显示的"源大小"应该用 raw 而非 markdownField，更直观）
- `:830`：`await updateInterface(docId, titleToUpdate, markdown, html, request);` → `await updateInterface(docId, titleToUpdate, buildPayloadMarkdownField(doc), html, request);`
- `:843`：`renderDocsSyncHtml(markdown, retryOptions, logPrefix)` → `renderSourceDocToHtml(doc, retryOptions, logPrefix)`
- `:844-848`：`buildUpdatePayload(docId, titleToUpdate, markdown, retryResult.html)` → `buildUpdatePayload(docId, titleToUpdate, buildPayloadMarkdownField(doc), retryResult.html)`
- `:852`：`await updateInterface(docId, titleToUpdate, markdown, retryResult.html, request);` → `await updateInterface(docId, titleToUpdate, buildPayloadMarkdownField(doc), retryResult.html, request);`
- `:859`：`buildDocsSyncHash(markdown, effectiveOptions)` → `buildDocsSyncHash(doc, effectiveOptions)`

- [ ] **Step 3: 删除 Task 6 的 `renderDocsSyncHtml` 薄包装**

现在没人调用了，删除函数定义。

- [ ] **Step 4: 删除现在不再使用的 import**

如果 `extractFirstMarkdownH1Title` / `renderMarkdownToHtml` 不再被 `docs-sync.ts` 直接调用，从 import 块（line 39-48）移除（保留被其它代码引用的）。运行 type-check 会告诉你。

- [ ] **Step 5: 跑类型检查 + 全部测试**

```bash
pnpm run type-check
pnpm test
```

Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add packages/yapi-mcp/src/cli/commands/docs-sync.ts
git commit -m "refactor(yapi-mcp): docs-sync 主循环消费 SourceDoc"
```

---

### Task 9: `buildUpdatePayload` / `updateInterface` 形参重命名

把 `markdown: string` 形参改为 `markdownField: string`，与新语义对齐（这是给 YApi 的 markdown 槽位，不是源文档内容）。

**Files:**
- Modify: `packages/yapi-mcp/src/cli/commands/docs-sync.ts`

- [ ] **Step 1: 重命名 `buildUpdatePayload`（`:484-495`）**

```ts
function buildUpdatePayload(
  docId: number,
  title: string | undefined,
  markdownField: string,
  html: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: docId, markdown: markdownField, desc: html };
  if (title) {
    payload.title = title;
  }
  return payload;
}
```

注意 YApi payload 的 JSON key 仍然叫 `markdown`，**只改 TS 形参名**。

- [ ] **Step 2: 重命名 `updateInterface`（`:677-689`）**

```ts
async function updateInterface(
  docId: number,
  title: string | undefined,
  markdownField: string,
  html: string,
  request: YapiRequest,
): Promise<void> {
  const payload = buildUpdatePayload(docId, title, markdownField, html);
  const resp = await request("/api/interface/up", "POST", {}, payload);
  if (resp?.errcode !== 0) {
    throw new Error(`interface up failed: ${resp?.errmsg || "unknown error"}`);
  }
}
```

- [ ] **Step 3: 跑类型检查 + 全部测试**

```bash
pnpm run type-check
pnpm test
```

Expected: 全部通过（调用点在 Task 8 已经传 `buildPayloadMarkdownField(doc)` 进去）。

- [ ] **Step 4: 提交**

```bash
git add packages/yapi-mcp/src/cli/commands/docs-sync.ts
git commit -m "refactor(yapi-mcp): payload markdown 形参重命名为 markdownField"
```

---

### Task 10: Watch 模式接收 `.html` 文件变更

**Files:**
- Modify: `packages/yapi-mcp/src/cli/commands/docs-sync.ts`

- [ ] **Step 1: 修改 `:1297`**

```ts
if (!name.endsWith(".md") && !name.endsWith(".html")) return;
```

- [ ] **Step 2: 跑类型检查 + 全部测试**

```bash
pnpm run type-check
pnpm test
```

- [ ] **Step 3: 提交**

```bash
git add packages/yapi-mcp/src/cli/commands/docs-sync.ts
git commit -m "feat(yapi-mcp): docs-sync watch 模式监听 .html 变更"
```

---

### Task 11: 集成测试 — 真正跑通 .html 同步路径

通过 mock `YapiRequest` 直接调用 `syncDocsDir`，断言 HTML 文件的 payload 字段正确。

**Files:**
- Create: `packages/yapi-mcp/tests/docs-sync-html.test.ts`

- [ ] **Step 1: 检查 `syncDocsDir` 是否已导出**

```bash
grep -n 'export.*syncDocsDir\|^function syncDocsDir\|^async function syncDocsDir' packages/yapi-mcp/src/cli/commands/docs-sync.ts
```

如果 `syncDocsDir` 不是 export 的，本任务需要先 export 它（仅加 `export` 关键字），便于测试直调。

- [ ] **Step 2: 写集成测试**

`packages/yapi-mcp/tests/docs-sync-html.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { syncDocsDir } from "../src/cli/commands/docs-sync";
import type { DocsSyncMapping, DocsSyncOptions, YapiRequest } from "../src/cli/types";

function makeMapping(): DocsSyncMapping {
  return {
    project_id: 1,
    catid: 2,
    files: {},
    file_hashes: {},
  } as DocsSyncMapping;
}

function makeMockRequest(captured: Array<{ url: string; payload?: any }>): YapiRequest {
  return (async (url: string, _method: string, _query?: any, payload?: any) => {
    captured.push({ url, payload });
    if (url === "/api/interface/list_cat") {
      return { errcode: 0, data: { list: [] } };
    }
    if (url === "/api/interface/add") {
      return { errcode: 0, data: { _id: 100 } };
    }
    if (url === "/api/interface/up") {
      return { errcode: 0 };
    }
    return { errcode: 0 };
  }) as unknown as YapiRequest;
}

describe("docs-sync HTML integration", () => {
  test("HTML source: payload.markdown is banner+fenced source, payload.desc is raw HTML", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-html-"));
    const htmlRaw = "<!doctype html><html><head><title>Hi</title></head><body><p>Hello</p></body></html>";
    writeFileSync(path.join(dir, "report.html"), htmlRaw, "utf8");

    const captured: Array<{ url: string; payload?: any }> = [];
    const mapping = makeMapping();
    mapping.files = { "report.html": 999 }; // 已有 binding 走 update 路径
    const options = {} as DocsSyncOptions;

    await syncDocsDir(dir, mapping, options, makeMockRequest(captured));

    const upCall = captured.find((c) => c.url === "/api/interface/up");
    assert.ok(upCall, "expected interface/up to be called");
    assert.equal(upCall!.payload.id, 999);
    assert.equal(upCall!.payload.desc, htmlRaw);
    assert.ok(String(upCall!.payload.markdown).includes("⚠️"));
    assert.ok(String(upCall!.payload.markdown).includes("```html"));
    assert.ok(String(upCall!.payload.markdown).includes(htmlRaw));
  });

  test("markdown source: payload.markdown equals raw md (backward compat)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-md-"));
    const md = "# Title\n\nbody";
    writeFileSync(path.join(dir, "report.md"), md, "utf8");

    const captured: Array<{ url: string; payload?: any }> = [];
    const mapping = makeMapping();
    mapping.files = { "report.md": 888 };
    const options = {} as DocsSyncOptions;

    await syncDocsDir(dir, mapping, options, makeMockRequest(captured));

    const upCall = captured.find((c) => c.url === "/api/interface/up");
    assert.ok(upCall, "expected interface/up to be called");
    assert.equal(upCall!.payload.markdown, md);
  });

  test("conflict: foo.md + foo.html → only foo.html is pushed, warn emitted", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-conflict-"));
    writeFileSync(path.join(dir, "foo.md"), "# md version", "utf8");
    writeFileSync(path.join(dir, "foo.html"), "<title>html version</title>", "utf8");

    const captured: Array<{ url: string; payload?: any }> = [];
    const mapping = makeMapping();
    mapping.files = { "foo.html": 777 };
    const options = {} as DocsSyncOptions;

    // 捕获 console.warn
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: any) => warnings.push(String(msg));
    try {
      await syncDocsDir(dir, mapping, options, makeMockRequest(captured));
    } finally {
      console.warn = origWarn;
    }

    const upCalls = captured.filter((c) => c.url === "/api/interface/up");
    assert.equal(upCalls.length, 1, "exactly one push expected");
    assert.equal(upCalls[0].payload.id, 777);
    assert.ok(warnings.some((w) => w.includes("foo.md") && w.includes(".html")), `expected conflict warning, got: ${warnings.join(" | ")}`);
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
node --test --import tsx tests/docs-sync-html.test.ts
```

Expected: 3 passing.

如果 `syncDocsDir` 不是 export 的，Step 3 会失败 → 回到 Step 1 加 export 后重试。

- [ ] **Step 4: 跑全部测试**

```bash
pnpm test
```

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/tests/docs-sync-html.test.ts packages/yapi-mcp/src/cli/commands/docs-sync.ts
git commit -m "test(yapi-mcp): docs-sync HTML 集成测试（payload / 兼容 / 冲突）"
```

---

### Task 12: README + CHANGELOG + version bump

**Files:**
- Modify: `packages/yapi-mcp/README.md`
- Modify: `packages/yapi-mcp/CHANGELOG.md`
- Modify: `packages/yapi-mcp/package.json`

- [ ] **Step 1: 检查现有 docs-sync 章节位置**

```bash
grep -n 'docs-sync\|docs sync' packages/yapi-mcp/README.md | head -10
```

- [ ] **Step 2: README 加 HTML 用法说明**

在 docs-sync 章节末尾追加（具体段落位置由 Step 1 输出决定）：

```markdown
### HTML 源文件支持（0.6.0+）

`docs-sync` 默认会扫目录里的 `.md` 和 `.html` 两种文件。HTML 文件**跳过渲染管线**，原样作为 YApi 的 `desc` 字段上传；同时往 `markdown` 字段写一段警告横幅 + 源码围栏，提示团队成员不要在 YApi 网页里直接编辑（会覆盖 desc）。

```html
<!-- 示例：report.html -->
<!doctype html>
<html>
  <head><title>季度分析</title></head>
  <body>...</body>
</html>
```

跑 `yapi docs-sync` 后，YApi 网页里看到的渲染描述就是 HTML 原文。

**约束**：
- HTML 必须 self-contained（CSS inline，图片用 base64 或外链 CDN），CLI 不会处理相对路径资源。
- HTML 内容不做 XSS 净化，请确保来源可信。
- 如果同名 `.md` 和 `.html` 同时存在，CLI 会优先用 `.html` 并 warn，建议手动删除 `.md`。
```

- [ ] **Step 3: CHANGELOG 加 0.6.0 条目**

`packages/yapi-mcp/CHANGELOG.md` 顶部插入：

```markdown
## 0.6.0 - 2026-05-14

### Features
- `docs-sync` 支持 `.html` 源文件：HTML 跳过渲染管线，原样上传 `desc`；`markdown` 字段填写警告横幅 + HTML 源码围栏，明示 "请勿在 YApi 网页编辑"。
- 同名 `.md` / `.html` 共存时优先采用 `.html` 并 warn。
- watch 模式同步监听 `.html` 文件变更。

### Compatibility
- 现有纯 markdown 流程行为不变：`buildDocsSyncHash` 对 markdown kind 走兼容路径，hash 值与 0.5.x 完全一致，升级后第一次 sync 不会触发不必要的重 push。
```

- [ ] **Step 4: package.json version bump**

```bash
cd packages/yapi-mcp
# 用 jq 安全改 version；如无 jq，手动编辑 package.json
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='0.6.0';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
```

验证：
```bash
grep '"version"' package.json
```
Expected: `"version": "0.6.0",`

- [ ] **Step 5: 提交**

```bash
git add packages/yapi-mcp/README.md packages/yapi-mcp/CHANGELOG.md packages/yapi-mcp/package.json
git commit -m "chore(yapi-mcp): 0.6.0 — docs-sync HTML 源文件支持"
```

---

### Task 13: 最终验收 — type-check + lint + 全测试

**Files:** 无

- [ ] **Step 1: type-check**

```bash
cd packages/yapi-mcp
pnpm run type-check
```

Expected: 无错误。

- [ ] **Step 2: lint**

```bash
pnpm run lint
```

Expected: 通过；新增代码无 lint 警告。

- [ ] **Step 3: 全部测试**

```bash
pnpm test
```

Expected: 现有 `auto-login.test.ts` / `skill-install.test.ts` / `yapi-cli.test.ts` + 新增 `source-doc.test.ts` / `docs-sync-hash.test.ts` / `docs-sync-html.test.ts` 全部通过。

- [ ] **Step 4: build**

```bash
pnpm run build
```

Expected: `dist/` 重新生成，无错误。

- [ ] **Step 5: 手动冒烟（用户操作 — 计划之外，但建议至少做一次）**

挑一份现成 HTML 文档（例如 `docs/round-option-percentage-slow-query-analysis.html` 或别的），配上一个真 YApi docId，跑：

```bash
cd /path/to/your/docs/dir
yapi docs-sync --dry-run
```

确认 preview 输出里 HTML 文件有 `markdown=...` `html=...` 字节数。然后去掉 `--dry-run` 实跑一次，去 YApi 网页确认：
1. `desc` 渲染区显示完整 HTML。
2. "编辑" 视图能看到警告横幅 + HTML 源码围栏。
3. 不要点保存，避免覆盖 desc。

- [ ] **Step 6: 没有遗留改动，提交干净**

```bash
git status
```

Expected: `nothing to commit, working tree clean`。

---

## 风险与回滚

| 风险 | 检测 | 回滚 |
|------|------|------|
| Task 7 hash 兼容回归断了 | `tests/docs-sync-hash.test.ts` 第 1 个用例失败 | 检查 `buildDocsSyncHash` 是否在 markdown 分支动了 `hash.update` 输入；必须与旧版一字节不差 |
| HTML 文件被错误地走了 mermaid 重试路径 | 真实运行触发 413 时观察日志 | `hasMermaidBlocks` 守卫已加 `doc.kind === "markdown"`，HTML 永远 false |
| README.md 被识别成 HTML 候选 | listSourceDocFiles 测试已覆盖 | 函数内 `if (name === "README.md" \|\| name === "README.html") continue;` |
| `syncDocsDir` 不可导出导致测试无法直调 | Task 11 Step 1 检测 | 加 `export` 关键字即可，无副作用 |
| YApi markdown 字段对 GFM blockquote 不渲染 | 手动冒烟 Step 5 在 YApi 网页观察 | 如果横幅显示为纯文本，改 `buildPayloadMarkdownField` 把 `> ⚠️` 改成 `⚠️ **警告**：...` 形式 |

---

## 不在本计划范围

- `--prune-orphan-hashes` flag（spec §10）
- HTML XSS 净化
- 相对路径资源 inline
- `.htm` / `.markdown` 扩展名扩展
- HTML 体积上限校验
- HTML → markdown 反向转换
