// 源文档（.md / .html）抽象：把扫描、加载、标题抽取、渲染、payload markdown 字段
// 这几件事按文件类型分派，让 docs-sync.ts 主循环不再硬编码 markdown。
import fs from "node:fs";
import type { DocsSyncOptions } from "../cli/types";
import {
  extractFirstMarkdownH1Title,
  renderMarkdownToHtml,
  type DiagramRenderMetric,
} from "./markdown";

export type SourceDocKind = "markdown" | "html";

export interface SourceDoc {
  kind: SourceDocKind;
  relPath: string;
  raw: string;
  title: string;
}

const HTML_TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, "").trim();
}

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

function detectKindByExt(relPath: string): SourceDocKind | null {
  if (relPath.endsWith(".md")) return "markdown";
  if (relPath.endsWith(".html")) return "html";
  return null;
}

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
      kept.push(group[0]);
    }
  }
  return { kept, dropped };
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
