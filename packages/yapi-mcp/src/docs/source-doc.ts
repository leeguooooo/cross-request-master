// 源文档（.md / .html）抽象：把扫描、加载、标题抽取、渲染、payload markdown 字段
// 这几件事按文件类型分派，让 docs-sync.ts 主循环不再硬编码 markdown。
import fs from "node:fs";
import { extractFirstMarkdownH1Title } from "./markdown";

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
